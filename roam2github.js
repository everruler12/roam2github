const path = require('path')
const fs = require('fs-extra')
const puppeteer = require('puppeteer')
const extract = require('extract-zip')

const edn_formatter = require('./edn_formatter.js').edn_formatter.core

console.time('R2G Exit after')

// NEED better check, because .env could exist in repo. like check if secrets exist in process.env, if so, IS_GITHUB_ACTION = true, other wise try local .env, and check again
let IS_LOCAL

try {
    // check for local .env
    if (fs.existsSync(path.join(__dirname, '.env'))) {
        require('dotenv').config()
        IS_LOCAL = true
    } else {
        IS_LOCAL = false
    }
} catch (err) { error(`.env file existence error: ${err}`) }

const download_dir = path.join(__dirname, 'tmp')
const extract_dir = path.join(download_dir, '_extraction')
const backup_dir = IS_LOCAL ? path.join(__dirname, 'backup') : getRepoPath()

let downloads_started = 0

const { R2G_EMAIL, R2G_PASSWORD, R2G_GRAPH, TIMEOUT } = process.env

if (!R2G_EMAIL) error('Secrets error: R2G_EMAIL not found')
if (!R2G_PASSWORD) error('Secrets error: R2G_PASSWORD not found')
if (!R2G_GRAPH) error('Secrets error: R2G_GRAPH not found')

function getRepoPath() {
    // This works because actions/checkout@v2 duplicates repo name in path /home/runner/work/roam-backup/roam-backup
    const parent_dir = path.join(__dirname, '..')
    const repo_name = path.basename(parent_dir)
    return path.join(parent_dir, repo_name)
}

init()

async function init() {
    try {
        await fs.remove(download_dir, { recursive: true })

        log('Creating browser')
        const browser = await puppeteer.launch({ args: ['--no-sandbox'] }) // to run in GitHub Actions
        // const browser = await puppeteer.launch({ headless: false }) // to test locally and see what's going on

        const page = await browser.newPage()
        page.setDefaultTimeout(TIMEOUT || 600000) // 10min default
        await page._client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: download_dir })
        // page.on('console', consoleObj => console.log(consoleObj.text())) // for console.log() to work in page.evaluate() https://stackoverflow.com/a/46245945
        // await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3419.0 Safari/537.36'); // https://github.com/puppeteer/puppeteer/issues/1477#issuecomment-437568281

        await roam_login(page)

        // for each graph {
        await roam_open_graph(page)
        await roam_download(page, 'JSON')
        await roam_download(page, 'EDN')
        // }

        log('Closing browser')
        browser.close()

        await extract_zips()
        await format_and_save()
        // deleteDir(download_dir)

    } catch (err) { error(err) }

    console.timeEnd('R2G Exit after')
}

async function roam_login(page) {
    return new Promise(async (resolve, reject) => {
        try {

            log('Navigating to login page')
            await page.goto('https://roamresearch.com/#/signin')

            const email_selector = 'input[name="email"]'

            log('Signing in')
            log('- Waiting for login form')
            await page.waitForSelector(email_selector)
            // possible refresh a second time on login screen https://github.com/MatthieuBizien/roam-to-git/issues/87#issuecomment-763281895

            log('- Filling email field')
            await page.type(email_selector, R2G_EMAIL)

            log('- Filling password field')
            await page.type('input[name="password"]', R2G_PASSWORD)
            log('- Clicking "Sign In"')
            await page.evaluate(() => {
                [...document.querySelectorAll('button')].find(button => button.innerText == 'Sign In').click()
            })

            const login_error_selector = 'div[style="font-size: 12px; color: red;"]' // error message on login page
            const graphs_selector = '.my-graphs' // successful login, on graphs selection page

            await page.waitForSelector(login_error_selector + ', ' + graphs_selector)

            const error_el = await page.$(login_error_selector)
            if (error_el) {
                const error_message = await page.evaluate(el => el.innerText, error_el)
                reject(`Login error. Roam says: "${error_message}"`)
            } else if (await page.$(graphs_selector)) {
                log('Login successful!')
                resolve()
            } else { // timeout?
                reject('Login error: unknown')
            }

        } catch (err) { reject(err) }
    })
}

async function roam_open_graph(page) {
    return new Promise(async (resolve, reject) => {
        try {

            log('Navigating to graph')
            // log('Navigating to graph', R2G_GRAPH.split('').join(' '))
            await page.goto('https://roamresearch.com/404')// workaround to get disablecss and disablejs parameters to work by navigating away due to issue with puppeteer and # hash navigation (used in SPAs like Roam)
            await page.goto(`https://roamresearch.com/#/app/${R2G_GRAPH}?disablecss=true&disablejs=true`)

            // log('- Waiting for graph to load')
            await page.waitForSelector('.loading-astrolabe')
            log('- astrolabe spinning...')
            await page.waitForSelector('.loading-astrolabe', { hidden: true })
            log('- astrolabe spinning stopped')

            // try {
            await page.waitForSelector('.roam-app') // add short timeout here, if fails, don't exit code 1, and instead CHECK if have permission to view graph
            // } catch (err) {
            //     await page.waitForSelector('.navbar') // Likely screen saying 'You do not have permission to view this database'
            //     reject()
            // }
            log('Graph loaded!')
            resolve()

        } catch (err) { reject(err) }
    })
}

async function roam_download(page, filetype) {
    return new Promise(async (resolve, reject) => {
        try {

            log('Exporting', filetype)
            await page.waitForSelector('.bp3-icon-more')

            log('- Clicking "..." button')
            await page.click('.bp3-icon-more')

            log('- Clicking "Export All"')
            await page.evaluate(() => {
                [...document.querySelectorAll('li .bp3-fill')].find(li => li.innerText == 'Export All').click()
            })

            log('- Waiting for export dialog')
            const chosen_format_selector = '.bp3-dialog .bp3-button-text'
            await page.waitForSelector(chosen_format_selector)

            const chosen_format = await page.$eval(chosen_format_selector, el => el.innerText)

            if (filetype != chosen_format) {
                log('- Clicking Export Format')
                await page.click(chosen_format_selector)

                page.waitForSelector('.bp3-text-overflow-ellipsis')

                log('- Choosing', filetype)
                await page.evaluate((filetype) => {
                    [...document.querySelectorAll('.bp3-text-overflow-ellipsis')].find(dropdown => dropdown.innerText == filetype).click()
                    // [...document.querySelectorAll('.bp3-text-overflow-ellipsis')].find(dropdown => dropdown.innerText == 'JSON').click()
                }, filetype)

            } else {
                log(filetype, 'already selected')
            }

            log('- Clicking "Export All"')
            await page.evaluate(() => {
                [...document.querySelectorAll('button')].find(button => button.innerText == 'Export All').click()
            })

            log('- Waiting for download to start')
            await page.waitForSelector('.bp3-spinner')
            await page.waitForSelector('.bp3-spinner', { hidden: true })

            log('- Downloading')
            downloads_started++

            const checkDownloads = async () => {
                const files = await fs.readdir(download_dir)

                if (files && files.filter(file => file.match(/\.zip$/)).length == downloads_started) { // contains .zip file
                    log(filetype, 'downloaded!')
                    resolve()
                } else checkDownloads()
            }
            checkDownloads()

        } catch (err) { reject(err) }
    })
}

async function extract_zips() {
    return new Promise(async (resolve, reject) => {
        try {

            const files = await fs.readdir(download_dir)

            if (files.length === 0) reject('Extraction error: download_dir is empty')

            for (const file of files) {
                log('Extracting ' + file)
                const file_fullpath = path.join(download_dir, file)

                await extract(file_fullpath, { dir: extract_dir })
                // log('Extraction complete')
            }

            resolve()

        } catch (err) { reject(err) }
    })
}


async function format_and_save() {
    return new Promise(async (resolve, reject) => {
        try {

            const files = await fs.readdir(extract_dir)

            if (files.length === 0) reject('Extraction error: extract_dir is empty')

            for (const file of files) {
                const file_fullpath = path.join(extract_dir, file)
                const fileext = file.split('.').pop()
                const new_file_fullpath = path.join(backup_dir, fileext, file)

                if (fileext == 'json') {

                    // log('Formatting JSON')
                    const json = await fs.readJson(file_fullpath)
                    const new_json = JSON.stringify(json, null, 2)

                    log('Saving formatted JSON')
                    fs.outputFile(new_file_fullpath, new_json)
                } else if (fileext == 'edn') {

                    log('Formatting EDN (this can take a couple minutes for large graphs)') // This could take a couple minutes for large graphs
                    const edn = await fs.readFile(file_fullpath, 'utf-8')

                    const edn_prefix = '#datascript/DB '
                    var new_edn = edn_prefix + edn_formatter.format(edn.replace(new RegExp('^' + edn_prefix), ''))
                    checkFormattedEDN(edn, new_edn)

                    log('Saving formatted EDN')
                    fs.outputFile(new_file_fullpath, new_edn)

                }
            }

            resolve()

        } catch (err) { reject(err) }
    })
}

function log(...messages) {
    const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '')
    console.log(timestamp, 'R2G', ...messages)
}

async function error(err) {
    log('ERROR -', err)
    console.timeEnd('R2G Exit after')
    // await page.screenshot({ path: path.join(download_dir, 'error.png' }) // will need to pass page as parameter... or set as parent scope
    process.exit(1)
}

function checkFormattedEDN(original, formatted) {
    const reverse_format = formatted
        .trim() // remove trailing line break
        .split('\n') // separate by line
        .map(line => line.trim()) // remove indents, and one extra space at end of second to last line
        .join(' ') // replace line breaks with a space

    if (original === reverse_format) {
        // log('(formatted EDN check successful)') // formatted EDN successfully reversed to match exactly with original EDN
        return true
    } else {
        error('EDN formatting error: mismatch with original')
        return false
    }
}