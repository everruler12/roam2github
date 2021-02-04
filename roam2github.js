const path = require('path')
const fs = require('fs-extra')
const puppeteer = require('puppeteer')
const extract = require('extract-zip')
const sanitize = require('sanitize-filename')
const edn_format = require('edn-formatter').edn_formatter.core.format

console.time('R2G Exit after')

// NEED better check, because .env could exist in repo. like check if secrets exist in process.env, if so, IS_GITHUB_ACTION = true, other wise try local .env, and check again
let IS_LOCAL

try {
    if (fs.existsSync(path.join(__dirname, '.env'))) { // check for local .env
        require('dotenv').config()
        IS_LOCAL = true
    } else {
        IS_LOCAL = false
    }
} catch (err) { error(`.env file existence error: ${err}`) }
const tmp_dir = path.join(__dirname, 'tmp')
const backup_dir = IS_LOCAL ? path.join(__dirname, 'backup') : getRepoPath()

const { R2G_EMAIL, R2G_PASSWORD, R2G_GRAPH, BACKUP_JSON, BACKUP_EDN, BACKUP_MARKDOWN, REPLACEMENT, SKIP_BLANKS, TIMEOUT } = process.env

if (!R2G_EMAIL) error('Secrets error: R2G_EMAIL not found')
if (!R2G_PASSWORD) error('Secrets error: R2G_PASSWORD not found')
if (!R2G_GRAPH) error('Secrets error: R2G_GRAPH not found')

const graph_names = R2G_GRAPH.split(/,|\n/)  // comma or linebreak separator
    .map(g => g.trim())// remove extra spaces
    .filter(g => g != '') // remove blank lines
// can also check "Not a valid name. Names can only contain letters, numbers, dashes and underscores." message that Roam gives when creating a new graph

const filetypes = [
    { type: "JSON", backup: BACKUP_JSON },
    { type: "EDN", backup: BACKUP_EDN },
    { type: "Markdown", backup: BACKUP_MARKDOWN }
].map(f => {
    (f.backup === undefined || f.backup.toLowerCase() === 'true') ? f.backup = true : f.backup = false
    return f
})

const skip_blanks = (SKIP_BLANKS && SKIP_BLANKS.toLowerCase()) === 'false' ? false : true

// what about specifying filetype for each graph? Maybe use settings.json in root of repo. But too complicated for non-programmers to set up.

function getRepoPath() {
    // This works because actions/checkout@v2 duplicates repo name in path /home/runner/work/roam-backup/roam-backup
    const parent_dir = path.join(__dirname, '..')
    const repo_name = path.basename(parent_dir)
    return path.join(parent_dir, repo_name)
}

init()

async function init() {
    try {

        await fs.remove(tmp_dir, { recursive: true })

        log('Create browser')
        const browser = await puppeteer.launch({ args: ['--no-sandbox'] }) // to run in GitHub Actions
        // const browser = await puppeteer.launch({ headless: false }) // to test locally and see what's going on

        const page = await browser.newPage()
        page.setDefaultTimeout(TIMEOUT || 600000) // 10min default
        // page.on('console', consoleObj => console.log(consoleObj.text())) // for console.log() to work in page.evaluate() https://stackoverflow.com/a/46245945

        page.on("dialog", async (dialog) => await dialog.accept()) // Handles "Changes will not be saved" dialog when trying to navigate away from official Roam help database https://roamresearch.com/#/app/help

        log('Login')
        await roam_login(page)

        for (const graph_name of graph_names) {

            log('Open graph', censor(graph_name))
            await roam_open_graph(page, graph_name)
            // TODO move const page = await browser.newPage() and page settings within roam_open_graph() - This will do away with 404 workaround, and allow downloading concurrently

            for (const f of filetypes) {
                if (f.backup) {
                    const download_dir = path.join(tmp_dir, graph_name, f.type.toLowerCase())
                    await page._client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: download_dir })

                    log('Export', f.type)
                    await roam_export(page, f.type, download_dir, graph_name)

                    await format_and_save(f.type, download_dir, graph_name)
                    // TODO run download and formatting operations asynchronously. Can be done since json and edn are same as graph name.
                    // Await for counter expecting total operations to be done graph_names.length * filetypes.filter(f=>f.backup).length
                    // or Promises.all(arr) where arr is initiated outside For loop, and arr.push result of format_and)_save
                }
            }
        }

        log('Close browser')
        browser.close()

        // await fs.remove(tmp_dir, { recursive: true })

        log('DONE!')

    } catch (err) { error(err) }

    console.timeEnd('R2G Exit after')
}

async function roam_login(page) {
    return new Promise(async (resolve, reject) => {
        try {

            log('- Navigating to login page')
            await page.goto('https://roamresearch.com/#/signin')

            log('- Checking for email field')
            await page.waitForSelector('input[name="email"]')

            log('- (Wait 10 seconds)')
            await page.waitForTimeout(10000) // because Roam auto refreshes the sign-in page, as mentioned here https://github.com/MatthieuBizien/roam-to-git/issues/87#issuecomment-763281895 (and can be seen in )
            // seems to fix `R2G ERROR - Error: Protocol error (DOM.describeNode): Cannot find context with specified id`

            log('- Filling email field')
            await page.type('input[name="email"]', R2G_EMAIL)

            log('- Filling password field')
            await page.type('input[name="password"]', R2G_PASSWORD)

            log('- Checking for "Sign In" button')
            await page.waitForFunction(() => [...document.querySelectorAll('button.bp3-button')].find(button => button.innerText == 'Sign In'))
            // const signin_button = await page.waitForXPath("//button[@class='bp3-button' and contains(., 'Sign In')]")

            log('- Clicking "Sign In"')
            await page.evaluate(() => { [...document.querySelectorAll('button.bp3-button')].find(button => button.innerText == 'Sign In').click() })
            // await signin_button.click()

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

async function roam_open_graph(page, graph_name) {
    return new Promise(async (resolve, reject) => {
        try {

            // TODO open new page instead, so run cocurrently

            log('- (Wait 1 second)')
            await page.waitForTimeout(1000) // to prevent `R2G ERROR - Error: net::ERR_ABORTED at https://roamresearch.com/404`

            log('- Navigating away to 404 (workaround)')
            await page.goto('https://roamresearch.com/404')// workaround to get disablecss and disablejs parameters to work by navigating away due to issue with puppeteer and # hash navigation (used in SPAs like Roam)

            log('- (Wait 1 second)')
            await page.waitForTimeout(1000)

            log('- Navigating to graph')
            await page.goto(`https://roamresearch.com/#/app/${graph_name}?disablecss=true&disablejs=true`)

            // log('- Checking for astrolabe spinner')
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

async function roam_export(page, filetype, download_dir, graph_name) {
    return new Promise(async (resolve, reject) => {
        try {

            // log('- Checking for "..." button', filetype)
            await page.waitForSelector('.bp3-icon-more')

            log('- Clicking "..." button')
            await page.click('.bp3-icon-more')

            log('- Checking for "Export All" option')
            await page.waitForFunction(() => [...document.querySelectorAll('li .bp3-fill')].find(li => li.innerText.match('Export All')))
            // const exportAll_option = await page.waitForXPath("//div[@class='bp3-text-overflow-ellipsis bp3-fill' and contains(., 'Export All')]")

            log('- Clicking "Export All" option')
            await page.evaluate(() => { [...document.querySelectorAll('li .bp3-fill')].find(li => li.innerText.match('Export All')).click() })
            // await exportAll_option.click()

            const chosen_format_selector = '.bp3-dialog .bp3-button-text'

            log('- Checking for export dialog')
            await page.waitForSelector(chosen_format_selector)

            const chosen_format = (await page.$eval(chosen_format_selector, el => el.innerText)).trim()
            log(`- format chosen is "${chosen_format}"`)

            if (filetype != chosen_format) {

                const dropdown_arrow = 'span.bp3-icon.bp3-icon-caret-down'

                log('- Checking for dropdown arrow')
                await page.waitForSelector(dropdown_arrow)
                // const dropdown_button = await page.waitForXPath(`//span[@class='bp3-icon bp3-icon-caret-down']`)

                log('- Clicking export format')
                await page.click(dropdown_arrow)
                // await page.click(dropdown_button) // 2021-02-02 16:51:23.632 R2G ERROR - Error: JSHandles can be evaluated only in the context they were created!

                log('- Checking for dropdown options')
                await page.waitForSelector('.bp3-text-overflow-ellipsis')

                log('- Checking for dropdown option', filetype)
                await page.waitForFunction((filetype) => [...document.querySelectorAll('.bp3-text-overflow-ellipsis')].find(dropdown => dropdown.innerText.match(filetype)), filetype)
                // const dropdown_option = await page.waitForXPath(`//div[@class='bp3-text-overflow-ellipsis bp3-fill' and contains(., '${filetype}')]`)

                log('- Clicking', filetype)
                await page.evaluate((filetype) => { [...document.querySelectorAll('.bp3-text-overflow-ellipsis')].find(dropdown => dropdown.innerText.match(filetype)).click() }, filetype)
                // await dropdown_option.click()

            } else {
                log('-', filetype, 'already selected')
            }

            log('- Checking for "Export All" button')
            await page.waitForFunction(() => document.querySelector('button.bp3-button.bp3-intent-primary').innerText == 'Export All')
            // const exportAll_button = await page.waitForXPath("//button[@class='bp3-button bp3-intent-primary' and contains(., 'Export All')]")

            log('- Clicking "Export All" button')
            await page.evaluate(() => { document.querySelector('button.bp3-button.bp3-intent-primary').click() })
            // await exportAll_button.click()

            log('- Waiting for download to start')
            await page.waitForSelector('.bp3-spinner')

            await page.waitForSelector('.bp3-spinner', { hidden: true })
            log('- Downloading')

            await fs.ensureDir(download_dir)


            async function checkDownloads() {
                try {

                    const files = await fs.readdir(download_dir)
                    const file = files[0]

                    if (file && file.match(/\.zip$/)) { // checks for .zip file

                        log(file, 'downloaded!')

                        await extract_file(file, download_dir, filetype, graph_name)

                        resolve()

                    } else checkDownloads()

                } catch (err) { reject(err) }
            }
            checkDownloads()

        } catch (err) { reject(err) }
    })
}

async function extract_file(file, download_dir, filetype, graph_name) {
    return new Promise(async (resolve, reject) => {
        try {

            const file_fullpath = path.join(download_dir, file)
            const extract_dir = path.join(download_dir, '_extraction')

            log('- Extracting ' + file)
            await extract(file_fullpath, {
                dir: extract_dir,

                onEntry(entry, zipfile) {
                    if (entry.fileName.endsWith('/')) {
                        // log('  - Skipping subdirectory', entry.fileName)
                        return false
                    }

                    if (skip_blanks && entry.uncompressedSize <= 3) { // files with 3 bytes just have a one blank block (like blank daily notes)
                        // log('  - Skipping blank file', entry.fileName, `(${entry.uncompressedSize} bytes`)
                        return false
                    }

                    // log('  -', entry.fileName)
                    entry.fileName = sanitizeFileName(entry.fileName)

                    if (fs.pathExistsSync(path.join(extract_dir, entry.fileName))) {

                        log('WARNING: file collision detected. Overwriting file with (sanitized) name:', entry.fileName)
                        // reject(`Extraction error: file collision detected with sanitized filename: ${entry.fileName}`)
                        // TODO? renaming to...
                    }

                    return true
                }
            })

            resolve()

        } catch (err) { reject(err) }
    })
}

async function format_and_save(filetype, download_dir, graph_name) {
    return new Promise(async (resolve, reject) => {
        try {

            const extract_dir = path.join(download_dir, '_extraction')

            const files = await fs.readdir(extract_dir)

            if (files.length === 0) reject('Extraction error: extract_dir is empty')

            if (filetype == 'Markdown') {


                const markdown_dir = path.join(backup_dir, 'markdown', graph_name)

                // log('- Removing old markdown directory')
                await fs.remove(markdown_dir, { recursive: true }) // necessary, to update renamed pages

                log('- Saving Markdown')

                for (const file of files) {

                    const file_fullpath = path.join(extract_dir, file)
                    const new_file_fullpath = path.join(markdown_dir, file)

                    await fs.move(file_fullpath, new_file_fullpath, { overwrite: true })
                }

            } else {

                // for (const file of files) {
                const file = files[0]
                const file_fullpath = path.join(extract_dir, file)
                const fileext = file.split('.').pop()
                const new_file_fullpath = path.join(backup_dir, fileext, file)

                if (fileext == 'json') {

                    log('- Formatting JSON')
                    const json = await fs.readJson(file_fullpath)
                    const new_json = JSON.stringify(json, null, 2)

                    log('- Saving formatted JSON')
                    await fs.outputFile(new_file_fullpath, new_json)

                } else if (fileext == 'edn') {

                    log('- Formatting EDN (this can take a couple minutes for large graphs)') // This could take a couple minutes for large graphs
                    const edn = await fs.readFile(file_fullpath, 'utf-8')

                    const edn_prefix = '#datascript/DB '
                    var new_edn = edn_prefix + edn_format(edn.replace(new RegExp('^' + edn_prefix), ''))
                    checkFormattedEDN(edn, new_edn)

                    log('- Saving formatted EDN')
                    await fs.outputFile(new_file_fullpath, new_edn)

                } else reject(`format_and_save error: Unhandled filetype: ${fileext}`)
                // }
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

// because GitHub Actions log censors the entire name as '***', but this allows to differentiate among multiple graphs while keeping it mostly private for when getting help troubleshooting
function censor(graph_name) {
    return graph_name.split('').map((char, i) => {
        if (i != 0 && i != graph_name.length - 1 && char != '-' && char != '_') return '*' // don't censor first letter, last letter, hyphens, and underscores
        else return char
    }).join('')
}

function sanitizeFileName(fileName) {
    fileName = fileName.replace(/\//g, '／')

    const sanitized = sanitize(fileName, { replacement: REPLACEMENT || '�' })

    if (sanitized != fileName) {

        log('    Sanitized:', fileName, '\n                                       to:', sanitized)
        return sanitized

    } else return fileName
}