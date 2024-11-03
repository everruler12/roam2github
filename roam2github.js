const path = require('path')
const fs = require('fs-extra')
const puppeteer = require('puppeteer')
const extract = require('extract-zip')
const sanitize = require('sanitize-filename')
const edn_format = require('edn-formatter').edn_formatter.core.format

console.time('R2G Exit after')

if (fs.existsSync(path.join(__dirname, '.env'))) { // check for local .env
    require('dotenv').config()
}

const { R2G_EMAIL, R2G_PASSWORD, R2G_GRAPH, BACKUP_JSON, BACKUP_EDN, BACKUP_MARKDOWN, BACKUP_FLAT_MARKDOWN, BACKUP_MSGPACK, MD_REPLACEMENT, MD_SKIP_BLANKS, TIMEOUT } = process.env
// IDEA - MD_SEPARATE_DN put daily notes in separate directory

if (!R2G_EMAIL) error('Secrets error: R2G_EMAIL not found')
if (!R2G_PASSWORD) error('Secrets error: R2G_PASSWORD not found')
if (!R2G_GRAPH) error('Secrets error: R2G_GRAPH not found')

const graph_names = R2G_GRAPH.split(/,|\n/)  // comma or linebreak separator
    .map(g => g.trim())// remove extra spaces
    .filter(g => g != '') // remove blank lines
// can also check "Not a valid name. Names can only contain letters, numbers, dashes and underscores." message that Roam gives when creating a new graph

const backup_types = [
    { type: "JSON", backup: BACKUP_JSON, extension: ".json" },
    { type: "EDN", backup: BACKUP_EDN, extension: ".edn" },
    { type: "Markdown", backup: BACKUP_MARKDOWN, extension: ".zip" },
    { type: "Flat Markdown", backup: BACKUP_FLAT_MARKDOWN, extension: ".md" },
    { type: "msgpack", backup: BACKUP_MSGPACK, extension: ".msgpack" }
].map(f => {
    f.backup = (f.backup === undefined || f.backup.toLowerCase() === 'true');
    return f;
})
// what about specifying filetype for each graph? Maybe use settings.json in root of repo. But too complicated for non-programmers to set up.

const md_replacement = MD_REPLACEMENT || '�'

const md_skip_blanks = (MD_SKIP_BLANKS && MD_SKIP_BLANKS.toLowerCase()) === 'false' ? false : true

const timeout = TIMEOUT || 600000 // 10min default

const tmp_dir = path.join(__dirname, 'tmp')

// ;
// (async () => {
// const repo_path = await getRepoPath()
const repo_path = getRepoPath()
const backup_dir = repo_path ? repo_path : path.join(__dirname, 'backup')
// })();


function getRepoPath() {
    const ubuntuPath = path.join('/', 'home', 'runner', 'work')
    const exists = fs.pathExistsSync(ubuntuPath)

    if (exists) {
        const files = fs.readdirSync(ubuntuPath)
            .filter(f => !f.startsWith('_')) // filter out [ '_PipelineMapping', '_actions', '_temp', ]

        if (files.length === 1) {
            repo_name = files[0]
            const files2 = fs.readdirSync(path.join(ubuntuPath, repo_name))

            // path.join(ubuntuPath, repo_name, 'roam2github') == __dirname
            const withoutR2G = files2.filter(f => f != 'roam2github') // for old main.yml

            if (files2.length === 1 && files2[0] == repo_name) {

                // log(files2, 'GitHub Actions path found')
                log('GitHub Actions path found')
                return path.join(ubuntuPath, repo_name, repo_name) // actions/checkout@v2 outputs to path /home/runner/work/<repo_name>/<repo_name>

            } if (files2.length == 2 && withoutR2G.length == 1 && withoutR2G[0] == repo_name) {

                // log(files2, 'GitHub Actions path found. (Old main.yml being used)')
                log('GitHub Actions path found. (Old main.yml being used)')
                return path.join(ubuntuPath, repo_name, repo_name) // actions/checkout@v2 outputs to path /home/runner/work/<repo_name>/<repo_name>

            } else {
                // log(files, 'detected in', path.join(ubuntuPath, repo_name), '\nNot GitHub Action')
                log('GitHub Actions path not found. Using local path')
                return false
            }

        } else {
            // log(files, 'detected in', ubuntuPath, '\nNot GitHub Action')
            log('GitHub Actions path not found. Using local path')
            return false
        }

    } else {
        // log(ubuntuPath, 'does not exist. Not GitHub Action')
        log('GitHub Actions path not found. Using local path')
        return false
    }
}


init()



async function newPage(browser) {
    const page = await browser.newPage()

    page.setDefaultTimeout(timeout)
    // page.on('console', consoleObj => console.log(consoleObj.text())) // for console.log() to work in page.evaluate() https://stackoverflow.com/a/46245945

    return page
}

async function init() {
    try {

        await fs.remove(tmp_dir, { recursive: true })

        log('Create browser')
        const browser = await puppeteer.launch({ args: ['--no-sandbox'] }) // to run in GitHub Actions
        // const browser = await puppeteer.launch({ headless: false }) // to test locally and see what's going on


        log('Login')
        await roam_login(browser)

        for (const graph_name of graph_names) {

            const page = await newPage(browser)

            log('Open graph', censor(graph_name))
            await roam_open_graph(page, graph_name)

            for (const f of backup_types) {
                if (f.backup) {
                    const download_dir = path.join(tmp_dir, graph_name, f.type.toLowerCase())
                    await page._client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: download_dir })

                    log('Export', f.type)
                    await roam_export(page, f.type, f.extension, download_dir)

                    log('Extract')
                    if (f.extension == ".zip") {
                        await extract_file(download_dir, f.extension)
                    }
                    await format_and_save(f.type, download_dir, graph_name)
                    // TODO run download and formatting operations asynchronously. Can be done since json and edn are same as graph name.
                    // Await for counter expecting total operations to be done graph_names.length * backup_types.filter(f=>f.backup).length
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

async function roam_login(browser) {
    return new Promise(async (resolve, reject) => {
        try {

            const page = await newPage(browser)

            log('- Navigating to login page')
            await page.goto('https://roamresearch.com/#/signin')

            log('- Checking for email field')
            await page.waitForSelector('input[name="email"]')

            log('- (Wait for auto-refresh)')
            // log('- (Wait 10 seconds for auto-refresh)')
            // await page.waitForTimeout(10000) // because Roam auto refreshes the sign-in page, as mentioned here https://github.com/MatthieuBizien/roam-to-git/issues/87#issuecomment-763281895 (and can be seen in non-headless browser)

            await page.waitForSelector('.loading-astrolabe', { timeout: 20000 })
            await page.waitForSelector('.loading-astrolabe', { hidden: true })
            // log('- auto-refreshed')

            log('- Filling email field')
            await page.type('input[name="email"]', R2G_EMAIL)

            log('- Filling password field')
            await page.type('input[name="password"]', R2G_PASSWORD)

            log('- Checking for "Sign In" button')
            await page.waitForFunction(() => [...document.querySelectorAll('button.bp3-button')].find(button => button.innerText == 'Sign In'))

            log('- Clicking "Sign In"')
            await page.evaluate(() => { [...document.querySelectorAll('button.bp3-button')].find(button => button.innerText == 'Sign In').click() })

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

            } else {
                reject('Login error: unknown')
            }

        } catch (err) { reject(err) }
    })
}

async function roam_open_graph(page, graph_name) {
    return new Promise(async (resolve, reject) => {
        try {

            page.on("dialog", async (dialog) => await dialog.accept()) // Handles "Changes will not be saved" dialog when trying to navigate away from official Roam help database https://roamresearch.com/#/app/help

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
            resolve(page)

        } catch (err) { reject(err) }
    })
}

async function roam_export(page, filetype, extension, download_dir) {
    return new Promise(async (resolve, reject) => {
        try {
            await fs.ensureDir(download_dir)

            // log('- Checking for "..." button', filetype)
            await page.waitForSelector('.bp3-icon-more')

            log('- (check for "Sync Quick Capture Notes")') // to check for "Sync Quick Capture Notes with Workspace" modal
            await page.waitForTimeout(1000)

            if (await page.$('.rm-quick-capture-sync-modal')) {
                log('- Detected "Sync Quick Capture Notes" modal. Closing')
                await page.keyboard.press('Escape')
                await page.waitForSelector('.rm-quick-capture-sync-modal', { hidden: true })
                log('- "Sync Quick Capture Notes" modal closed')
            }

            log('- Clicking "..." button')
            await page.click('.bp3-icon-more')

            log('- Checking for "Export All" option')
            await page.waitForFunction(() => [...document.querySelectorAll('li .bp3-fill')].find(li => li.innerText.match('Export All')))

            log('- Clicking "Export All" option')
            await page.evaluate(() => { [...document.querySelectorAll('li .bp3-fill')].find(li => li.innerText.match('Export All')).click() })

            const chosen_format_selector = '.bp3-dialog .bp3-button-text'

            log('- Checking for export dialog')
            await page.waitForSelector(chosen_format_selector)

            const chosen_format = (await page.$eval(chosen_format_selector, el => el.innerText)).trim()
            log(`- format chosen is "${chosen_format}"`)

            if (filetype != chosen_format) {

                log('- Clicking export format')
                await page.click(chosen_format_selector)

                log('- Checking for dropdown options')
                await page.waitForSelector('.bp3-text-overflow-ellipsis')

                log('- Checking for dropdown option', filetype)
                await page.waitForFunction((filetype) => [...document.querySelectorAll('.bp3-text-overflow-ellipsis')].find(dropdown => dropdown.innerText.match(filetype)), filetype)

                log('- Clicking', filetype)
                await page.evaluate((filetype) => { [...document.querySelectorAll('.bp3-text-overflow-ellipsis')].find(dropdown => dropdown.innerText.match(filetype)).click() }, filetype)

            } else {
                log('-', filetype, 'already selected')
            }

            log('- Checking for "Export All" button')
            await page.waitForFunction(() => document.querySelector('button.bp3-button.bp3-intent-primary').innerText == 'Export All')

            log('- Clicking "Export All" button')
            await page.evaluate(() => { document.querySelector('button.bp3-button.bp3-intent-primary').click() })

            log('- Waiting for download to start')
            await page.waitForSelector('.bp3-spinner')

            await page.waitForSelector('.bp3-spinner', { hidden: true })
            log('- Downloading')

            await waitForDownload(download_dir, extension)

            resolve()

        } catch (err) { reject(err) }
    })
}

function waitForDownload(download_dir, extension) {
    return new Promise(async (resolve, reject) => {
        try {

            checkDownloads()

            async function checkDownloads() {

                const files = await fs.readdir(download_dir)
                const file = files[0]

                if (file && file.match(new RegExp(`\\${extension}$`))) { // checks for specified extension

                    log(file, 'downloaded!')
                    resolve()

                } else checkDownloads()
            }

        } catch (err) { reject(err) }
    })
}

async function extract_file(download_dir, extension) {
    return new Promise(async (resolve, reject) => {
        try {

            const files = await fs.readdir(download_dir)

            if (files.length === 0) reject('Extraction error: download_dir is empty')
            if (files.length > 1) reject('Extraction error: download_dir contains more than one file')

            const file = files[0]

            if (!file.match(/\.zip$/)) reject('Extraction error: .zip not found')

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

                    if (md_skip_blanks && entry.uncompressedSize <= 3) { // files with 3 bytes just have a one blank block (like blank daily notes)
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

            if (filetype == 'Markdown') {

                const extract_dir = path.join(download_dir, '_extraction')

                const files = await fs.readdir(extract_dir)

                if (files.length === 0) reject('Extraction error: extract_dir is empty')

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

                const files = await fs.readdir(download_dir)
                const file = files[0]
                const file_fullpath = path.join(download_dir, file)
                const fileext = file.split('.').pop()
                const new_file_fullpath = path.join(backup_dir, fileext, file)
                const new_file_fullpath_nodate = new_file_fullpath.replace(/-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}/, '');

                if (fileext == 'json') {

                    log('- Formatting JSON')
                    const json = await fs.readJson(file_fullpath)
                    const new_json = JSON.stringify(json, null, 2)

                    log('- Saving formatted JSON')
                    await fs.outputFile(new_file_fullpath_nodate, new_json)

                } else if (fileext == 'edn') {
                    log('- Formatting EDN (this can take a couple minutes for large graphs)') // This could take a couple minutes for large graphs
                    const edn = await fs.readFile(file_fullpath, 'utf-8')

                    const edn_prefix = '#datascript/DB '
                    var new_edn = edn_prefix + edn_format(edn.replace(new RegExp('^' + edn_prefix), ''))
                    checkFormattedEDN(edn, new_edn)

                    log('- Saving formatted EDN')
                    await fs.outputFile(new_file_fullpath_nodate, new_edn)

                } else reject(`format_and_save error: Unhandled filetype: ${files}`)
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

// async function getRepoPath() {
//     return new Promise(async (resolve, reject) => {
//         try {

//             const ubuntuPath = path.join('/', 'home', 'runner', 'work')
//             const exists = await fs.pathExists(ubuntuPath)

//             if (exists) {
//                 const files = (await fs.readdir(ubuntuPath))
//                     .filter(f => !f.startsWith('_')) // filter out [ '_PipelineMapping', '_actions', '_temp', ]

//                 if (files.length === 1) {
//                     repo_name = files[0]
//                     const files2 = await fs.readdir(path.join(ubuntuPath, repo_name))

//                     if (files2.length === 1 && files2[0] == repo_name) {

//                         log(files2, 'GitHub Action path found')
//                         resolve(path.join(ubuntuPath, repo_name, repo_name)) // actions/checkout@v2 outputs to path /home/runner/work/<repo_name>/<repo_name>

//                     } else {
//                         log(files, 'detected in', path.join(ubuntuPath, repo_name), '\nNot GitHub Action')
//                         resolve(false)
//                     }

//                 } else {
//                     log(files, 'detected in', ubuntuPath, '\nNot GitHub Action')
//                     resolve(false)
//                 }

//             } else {
//                 log(ubuntuPath, 'does not exist. Not GitHub Action')
//                 resolve(false)
//             }

//         } catch (err) { reject(err) }
//     })
// }

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

    const sanitized = sanitize(fileName, { replacement: md_replacement })

    if (sanitized != fileName) {

        log('    Sanitized:', fileName, '\n                                       to:', sanitized)
        return sanitized

    } else return fileName
}
