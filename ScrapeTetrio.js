const fetch = require("node-fetch")
const fs = require("fs")
const csvParser = require("csv-parser")
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const inquirer = require("inquirer")


// const proxyUrl = "https://cors-anywhere.herokuapp.com/"
const resultspath = "output/"
const csvRegex = /.+.csv/
const now = new Date();
const formattedNow = `TetrioVN_${addOpt0(now.getDate()+1)}${addOpt0(now.getMonth())}${addOpt0(now.getFullYear() % 1000)}_${addOpt0(now.getHours())}${addOpt0(now.getMinutes())}`
let totalPlayers;
const headers = ["username", "TR", "glk", "RD", "GW", "GP", "WR", "apm", "pps", "VS", "GR", "top", "trvariance", "topVNvariance"]
const rankMap = {
    x: "X",
    u: "U",
    ss: "SS",
    sp: "S+",
    s: "S",
    sm: "S-",
    ap: "A+",
    a: "A",
    am: "A-",
    bp: "B+",
    b: "B",
    bm: "B-",
    cp: "C+",
    c: "C",
    cm: "C-",
    dp: "D+",
    d: "D"
}
var csvWriter;
const vnFloatFormat = new Intl.NumberFormat("it-IT");
const csvHeaders = [
    { id: "username", title: "Tên" },
    { id: "TR", title: "TR" },
    { id: "glk", title: "Glicko" },
    { id: "RD", title: "RD" },
    { id: "GW", title: "Thắng" },
    { id: "GP", title: "Tổng" },
    { id: "WR", title: "% thắng" },
    { id: "apm", title: "APM" },
    { id: "pps", title: "PPS" },
    { id: "VS", title: "VS" },
    { id: "rank", title: "Rank" },
    { id: "top", title: "Top" },
    { id: "trvariance", title: "" },
    { id: "topVNvariance", title: "" }

]

function addOpt0(value) {
    value = value.toString()
    if (value.length === 1) {
        value = "0" + value;
    }
    return value
}
function commaDecimal(value) {
    if (!value || Number.isNaN(value)) return "";
    return value.toString().replace(".", ",")
}

async function read(filePath) {
    return new Promise((resolve) => {
        const prevArr = []
        fs.createReadStream(filePath)
            .on("error", err => { console.log(filePath + " doesn't exists. Comparing to an empty file..."); resolve(prevArr) })
            .pipe(csvParser({
                mapHeaders: ({ index }) => headers[index]
            }))
            .on("data", data => {
                for (const property in data) {
                    data[property] = data[property].toLowerCase()
                    let tempStr = data[property]
                    try {
                        const temp = parseFloat(data[property]);
                        if (Number.isNaN(temp)) throw new Error("Error parsing")
                        data[property] = temp;
                    } catch (e) {
                        data[property] = tempStr
                    }
                }

                prevArr.push(data)
            })
            .on("end", () => resolve(prevArr))
    })
}


function extractUsernames(filePath) {
    return fs.readFileSync(filePath, { encoding: "utf-8" }).split(/[\r|\n]+/).map(username => username.toLowerCase());

}

function findUserIndex(array, username) {
    return array.findIndex(user => user.username === username)
}

function findUser(array, username) {
    return array.find(user => user.username === username)
}

// function sortByTR(a,b){
//     if(!a.TR) return 1
//     if(!b.TR) return -1
//     return b.TR - a.TR 
// }

async function filterNeeded(prev, usersData) {
    usersData.sort((a, b) => { 
        if(!a.TR) return 1
        if(!b.TR) return -1
        return b.TR - a.TR 
    })
    usersData = usersData.map((user, userIndex) => {
        const prevRecord = findUser(prev, user.username)
        const prevIndex = findUserIndex(prev, user.username)
        const topVNvariance = (prevIndex !== -1) ? (prevIndex - userIndex) : (usersData.length - userIndex - 1)
        const returnValue = {
            ...user,
            username: user.username.toUpperCase(),
            TR: user.TR?Math.round(user.TR):"",
            rank: rankMap[user.rank] || "?",
            top: user.GR?user.GR / totalPlayers:"",
            topVNvariance: addArrow(topVNvariance),
            trvariance: (!prevRecord || !user.TR || !Math.round((user.TR - prevRecord.TR))) ? "" : addArrow(Math.round(user.TR - prevRecord.TR)) + " TR"
        }

        return returnValue
    }

    )
    return usersData
}

function addArrow(value) {
    if (value === 0) {
        return ""
    } else if (value > 0) {
        return `↑ ${value}`
    } else {
        return `↓ ${Math.abs(value)}`
    }
}

async function fetchingData(url) {
    const data = await fetch(url)
        .then(res => res.json())
        .catch(err => {
            console.error(err);
            setTimeout(process.exit, 3000);
        })
    return data
}

function setTotalPlayers(value) {
    totalPlayers = value
}

async function getUsersData(usernames) {
    const data = await fetchingData("https://tetrio.team2xh.net/data/players.js")
    const allUsersStats = data.latest_stats
    setTotalPlayers(data.total_players);
    return usernames.map(user => ({
        username: user,
        ...allUsersStats[user]
    }))

}

function findLatestCSVfile(folderPath = resultspath) {
    const filenames = fs.readdirSync(folderPath)
    const csvFiles = filenames.filter(filename => csvRegex.test(filename));
    if (csvFiles.length === 0) return "fake.csv"
    if (csvFiles.length === 1) return resultspath + csvFiles[0]
    let prevStats = null;
    return csvFiles.reduce((prev, current) => {
        currentStats = fs.statSync(folderPath + current)
        if (prevStats === null || currentStats.birthtime > prevStats.birthtime) {
            prevStats = currentStats
            return folderPath + current
        }
    })
}

async function run() {
    let usernamesPath;
    let compareToCsvPath;

    await inquirer.prompt([
        {
            name: 'usernamesPath',
            message: 'Name/Path of players\' usernames .txt file:',
            default: 'tetrio_players.txt',
        },
        {
            name: 'outputCsvPath',
            message: 'Name/Path of output .csv file:',
            default: `output/${formattedNow}.csv`,
        },
        {
            name: 'compareToCsvPath',
            message: 'Name/Path of previous .csv file:',
            default: `${findLatestCSVfile()}`,
        }
    ])
        .then(answers => {
            usernamesPath = answers.usernamesPath
            csvWriter = createCsvWriter({
                path: answers.outputCsvPath,
                header: csvHeaders
            })
            compareToCsvPath = answers.compareToCsvPath
        })

    const compareToCsv = await read(compareToCsvPath)
    const usernames = extractUsernames(usernamesPath)
    const result = await getUsersData(usernames);
    const filteredData = await filterNeeded(compareToCsv, result)

    csvWriter.writeRecords(filteredData)
    console.log("DONE!!!")
    setTimeout(() => process.exit(), 2000)
}



run()