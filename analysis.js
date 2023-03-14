import chart  from "chart.js"
import fs from "fs"
import { patienceDiff } from "./patiencediff.js"
import canvasRender from "chartjs-node-canvas"

const UserType = {
    IP: "IP",
    MAC: "MAC",
    NAME: "NAME",

    getFromString: (name) => {
        if (/^(?!0)(?!.*\.$)((1?\d?\d|25[0-5]|2[0-4]\d)(\.|$)){4}$/.test(name))
            return UserType.IP
        else if (name.includes(":"))
            return UserType.MAC
        else return UserType.NAME
    }
}

const SMALL = 50
const requestUsers = (users) => {
    let url = "https://en.wikipedia.org/w/api.php"

    const params = {
        action: "query",
        list: "users",
        ususers: users.join("|"),
        usprop: "blockinfo|groups|editcount|registration|emailable|gender",
        format: "json"
    }

    url = url + "?origin=*";
    Object.keys(params).forEach(function(key){url += "&" + key + "=" + params[key];});


    return new Promise((resolve, reject) => {
        fetch(url).then(result => {
            resolve(result.json())
        }).catch(err => reject(err))
    })
}

const requestUsersSafe = async (users) => {
    let newUsers = []
    const chunkSize = 50;
    for (let i = 0; i < users.length; i += chunkSize) {
        const chunk = users.slice(i, i + chunkSize);
        const usrs = await requestUsers(chunk)
        newUsers = [...newUsers, ...usrs.query.users]
    }
    return newUsers
}

const getchanges = (revisions) => {
    let changes = []
    for (let i = 1;  i < revisions.length; i++) {
        let before = revisions[i-1]
        let after = revisions[i]
        const diffs = patienceDiff(before["*"], after["*"])
        changes = [...changes, {
            addition: diffs.lines.filter(it => it.aIndex === -1),
            removal: diffs.lines.filter(it => it.bIndex === -1),
            user: after.user,
            comment: after.comment,
            userType: UserType.getFromString(after.user) 
        }]
    }
    return changes
}


const buildDataItem = async (revisions) => {
    const changes = getchanges(revisions)


    const extractsStartIndecies = (indecies) => {
        const indecies2 = []
        let before = undefined
        for (const index of indecies) {
            if (index !== -1 && index-1 != before)
                indecies2.push(index)
            before = index;
        }
        return indecies2
    }

    const users = await requestUsersSafe(changes.map(it => it.user))


    changes.forEach((it, i) => {
        it.additionStarts = extractsStartIndecies(it.addition.map(it2 => it2.bIndex))
        it.removalStarts = extractsStartIndecies(it.addition.map(it2 => it2.aIndex))

        it.addition = it.addition.map(it2 => it2.line).join("")
        it.removal = it.removal.map(it2 => it2.line).join("")
        it.user = users[i]
    })

    return changes
}

const userAnalysis = (users) => {
    const userOccurance = new Map()

    const add =(item) => {
        if (userOccurance.has(item))
            userOccurance.set(item, userOccurance.get(item)+1)
        else userOccurance.set(item ,1)
    }

    for (const user of users) 
        add(user)

    return userOccurance
}


const buildGraphs = async (changes) => {
    
    const registeredUsers = changes.filter(it => it.userType === UserType.NAME && it.user !=undefined)

    const canvasRenderService = new canvasRender.ChartJSNodeCanvas({width: 800, height: 800, chartCallback: (c) => {}})
    
    //user graph
    let buffer = await canvasRenderService.renderToBuffer({
        type: 'doughnut',
		data: {
			labels: ['Anonym', 'Männer', 'Frauen', "'Unbekannt"],
			datasets: [{
				label: '# of Votes',
				data: [
                    changes.filter(it => it.userType === UserType.IP || it.userType === UserType.MAC || it.user === undefined).length,
                    registeredUsers.filter(it => it.user.gender === 'male').length,
                    registeredUsers.filter(it => it.user.gender === 'female').length,
                    registeredUsers.filter(it => it.user.gender === 'unknown').length,
                ],
				backgroundColor: [
					'rgba(255, 99, 132, 0.7)',
					'rgba(54, 162, 235, 0.7)',
                    'rgb(102, 255, 102, 0.7)',
                    'rgb(255, 255, 102, 0.7)'
				],
	 			borderColor: [
					'rgba(255,99,132,1)',
					'rgba(54, 162, 235, 1)',
                    'rgb(102, 255, 102)',
                    'rgb(255, 255, 102)'
				],
				borderWidth: 1
			}]
		},
		options: {
		}
    })
    fs.writeFileSync("./users.png", buffer)

    const bigChanges = changes.filter(it => it.addition.length >= SMALL  || it.removal.length >= SMALL)
    const smallChanges = changes.filter(it => it.addition.length < SMALL || it.removal.length < SMALL)

    buffer = await canvasRenderService.renderToBuffer({
        "type": "pie",
        data: {
            labels: ["Kleine Änderung", "Große Änderung"],
            datasets: [{
                data: [
                    smallChanges.length,
                    bigChanges.length
                ],
                backgroundColor: [
                    'rgba(255, 99, 132, 0.7)',
					'rgba(54, 162, 235, 0.7)',
                ],
                borderColor: [
                    'rgba(255, 99, 132)',
					'rgba(54, 162, 235)',
                ]
            }]
        }
    })
    fs.writeFileSync("./change.png", buffer)

    buffer = await canvasRenderService.renderToBuffer({
        "type": "bar",
        options: {
            font: {
                size: "20px"
            }
        },
        data: {
            labels: ["Anonym", "Angemeldet"],
            datasets: [{
                data: [
                    smallChanges.filter(it => it.userType !== UserType.NAME).length,
                    smallChanges.filter(it => it.userType === UserType.NAME).length
                    
                ],
                backgroundColor: [
                    'rgba(255, 99, 132, 0.7)',
					'rgba(54, 162, 235, 0.7)',
                ],
                borderColor: [
                    'rgba(255, 99, 132)',
					'rgba(54, 162, 235)',
                ]
            }]
        }
    })
    fs.writeFileSync("./smallUser.png", buffer)

    buffer = await canvasRenderService.renderToBuffer({
        "type": "bar",
        options: {
            font: {
                size: "20px"
            }
        },
        data: {
            labels: ["Anonym", "Angemeldet"],
            datasets: [{
                data: [
                    bigChanges.filter(it => it.userType !== UserType.NAME).length,
                    bigChanges.filter(it => it.userType === UserType.NAME).length
                    
                ],
                backgroundColor: [
                    'rgba(255, 99, 132, 0.7)',
					'rgba(54, 162, 235, 0.7)',
                ],
                borderColor: [
                    'rgba(255, 99, 132)',
					'rgba(54, 162, 235)',
                ]
            }]
        }
    })
    fs.writeFileSync("./bigUser.png", buffer)

    


}

const generateTimeActivityList = (revisions) => {
    revisions.map(it => it.timestampt)
}

const contetntStr = fs.readFileSync("source.json")
const content = JSON.parse(contetntStr)
const revisions = content.revisions


const users = JSON.parse(fs.readFileSync("names.json"))


const changes = await buildDataItem(revisions)
buildGraphs(changes)

console.log(changes.map(it => it.user).filter(it => it?.groups?.includes('autoconfirmed')))

const leaderboard = userAnalysis(users)

console.log(leaderboard)