"use strict";

const { docker,
    followProgress,
    pullImage,
    execDockerCmd,
    deleteImageFromRegistry } = require('./dockerUtils');

const fs = require('fs').promises;
const crypto = require('crypto');
const path = require('path');
const md5File = require('md5-file');

const BASE_IMAGE = 'nubo-ubuntu:20.04';

// Status codes in user_apps
const ERROR = -1;
const FINISHED = 0;
const COPYING = 1;
const INSTALLING = 2;

let initialized = false;


async function init() {
    if (initialized) {
        return;
    }
    const { Common } = require('./mainModule').get();
    const registryURL = Common.registryURL;
    const registryUser = Common.registryUser;
    const registryPassword = Common.registryPassword;
    if (registryURL && registryUser && registryPassword) {
        await execDockerCmd(['login', '-u', registryUser, '-p',registryPassword,registryURL]);
    }
    initialized = true;
}   


function getDefaultApps() {
    const { Common } = require('./mainModule').get();
    if (Common.desktopDefaultApps) {
        return Common.desktopDefaultApps;
    } else {
        return require('./defaultApps');
    }
}

function getUserPlatforms(email, deviceIds) {
    const { AddAppsToProfiles } = require('./mainModule').get();
    return new Promise((resolve, reject) => {
        AddAppsToProfiles.getUserPlatforms(email, deviceIds,
            function (err, p, u, userIds, devices) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve({
                    platforms: p,
                    uniquePlatforms: u,
                    userIdInPlatforms: userIds
                });
            });

    });
}

function attachAppsToPlatform(platform, tasks) {
    return new Promise((resolve, reject) => {
        platform.attachApps(tasks, function (err) {
            // ignore errors
            resolve();
        });
    });
}

/**
 * Create docker image the given user. If Image that contains the exact app already exists just use that image
 * Update the docker_image field in the users table 
 * @param {String} email 
 */
async function createImageForUser(email,domain) {
    const { Common } = require('./mainModule').get();
    const logger = Common.logger;
    try {
        if (!initialized) {
            await init();
        }
        // get a list of all apps that this user have
        let userApps = await Common.db.UserApps.findAll({
            attributes: ['packagename'],
            where: {
                email: email,
                maindomain: domain
            },
            order: [['packagename', 'ASC']],
        });
        const allUserPackages = userApps.map(item => item.packagename);
        let allDebApps = await Common.db.Apps.findAll({
            attributes: ['packagename', 'apptype', 'filename', 'versionname'],
            where: {
                packagename: allUserPackages,
                maindomain: domain,
                apptype: 'deb'
            },
            order: [['updatedAt','ASC'],['packagename', 'ASC']],
        });
        //logger.info(`allDebApps: ${JSON.stringify(allDebApps, null, 2)}`);

        // calculate hash from the ordered list of apps to see if we already have image with the same apps
        let allJSON = JSON.stringify(allDebApps);
        const hash = crypto.createHash('sha256').update(allJSON, 'utf-8').digest('hex').toLowerCase();

        // look for the hash in the AppImages table
        let imageName;
        let imageObj = await Common.db.Images.findOne({      
            where: {
                maindomain: domain,
                content_hash: hash                                
            },
        });
        if (imageObj) {
            imageName = imageObj.image_name;
            logger.info(`Hash found: ${hash}`);
        }
        
        // try to find the exact hash as a file in docker_apps dir
        /*let appsFolder = `./docker_apps`;
        await fs.mkdir(appsFolder, { recursive: true });
        let imageName;
        let imageHashFile = path.join(appsFolder, `img_${hash}.json`);
        try {
            await fs.stat(imageHashFile);            
            let content = await fs.readFile(imageHashFile, 'utf8');
            let obj = JSON.parse(content);
            imageName = obj.imageName;
        } catch (err) {
            //console.log(`Image not found`,err);
        }*/
        if (!imageName) {
            logger.info(`Hash not found: ${hash}!`);
            // generate image and create a file
            imageName = await createImage(allDebApps);

            // insert new image with the hash to DB
            await Common.db.Images.upsert({
                maindomain: domain,
                image_name: imageName,
                content_hash: hash
            });
            // create file with the image details
            /*await fs.writeFile(imageHashFile, JSON.stringify({
                imageName,
                apps: allDebApps
            }));*/

        } else {
            logger.info(`Image found: ${imageName}`);
        }

        // save the image name in the User table
        await Common.db.User.update({
            docker_image: imageName
        }, {
            where: {
                email: email,
                orgdomain: domain
            }
        });
        logger.info(`Updated user ${email} with image name ${imageName}`);
        return imageName;
    } catch (err) {
        logger.error(`createImageForUser error: ${err}`, err);
        throw err;
    }
}

async function addRemoveAppsForDevices(deviceIds, time, hrTime, email, packageNames, domain, isNeedToInstall) {
    const { Common } = require('./mainModule').get();
    const logger = Common.logger;
    try {

        // install / uninstall app on running sessions
        const {
            platforms,
            uniquePlatforms,
            userIdInPlatforms
        } = await getUserPlatforms(email, deviceIds);
        if (platforms && platforms.length > 0) {
            /**
            * Map package name to file name (if exsists)
            */
            let packageFileNames = {};
            if (isNeedToInstall) {
                // get file name if it a deb file
                let results = await Common.db.Apps.findAll({
                    attributes: ['packagename', 'filename'],
                    where: {
                        packagename: packageNames,
                        maindomain: domain
                    },
                });

                for (const item of results) {
                    packageFileNames[item.packagename] = item.filename;
                }
            }
            for (const uniquePlatform of uniquePlatforms) {
                /**
                 * We calculate all the tasks for each uniqe platform and send it all at once
                 */
                let tasks = [];
                for (let idx = 0; idx < platforms.length; idx++) {
                    if (platforms[idx].params.platid == uniquePlatform.params.platid) {
                        for (const packageName of packageNames) {
                            tasks.push({
                                packageName,
                                unum: userIdInPlatforms[idx],
                                task: isNeedToInstall ? 1 : 0,
                                filename: packageFileNames[packageName]
                            });
                        }
                    }
                }
                await attachAppsToPlatform(uniquePlatform, tasks);
            }
        }
        // change docker image for the user to have the exact apps
        await createImageForUser(email,domain);

        //appFileName = crypto.randomBytes(32).toString('hex') + ".deb";
        //'./docker_apps'





    } catch (err) {
        logger.error(`addRemoveAppsForDevices error: ${err}`, err);
        throw err;
    }
}

/**
 * Create linux docker image that contains all the apps define in allDebApps array
 * @param {Array} allDebApps 
 */
async function createImage(allDebApps) {
    const { Common, CommonUtils } = require('./mainModule').get();
    const logger = Common.logger;
    const registryURL = Common.registryURL;
    const baseImage = `${registryURL}/nubo/${BASE_IMAGE}`;
    if (!initialized) {
        await init();
    }


    await pullImage(baseImage);

    let imageName = `user${crypto.randomBytes(16).toString('hex')}:latest`;    
    let token = crypto.randomBytes(32).toString('hex');
    let buildFolder = `./docker_temp/${token}`;
    

    let srcList = ['Dockerfile'];   
    await fs.mkdir(buildFolder, { recursive: true });
    let debsFolder = CommonUtils.buildPath(Common.nfshomefolder, 'debs');


    let aptCmds = [];
    let fileCmds = [];
    for (const srcFile of allDebApps) {
        if (srcFile.filename) {
            const basename = path.basename(srcFile.filename);
            const dstFile = path.join(buildFolder, basename);
            const debSrcFile = path.join(debsFolder,srcFile.filename)
            console.log(`Copy src ${debSrcFile} to ${dstFile}`);
            await fs.copyFile(debSrcFile, dstFile);
            fileCmds.push(`COPY ${basename} /tmp/.`);
            fileCmds.push(`RUN apt install -y /tmp/${basename}`);
            fileCmds.push(`RUN rm -f /tmp/${basename}`);            
            srcList.push(basename);
        } else {
            aptCmds.push(`RUN apt install -y ${srcFile.packagename}`);           
        }
    }
    let debFile = "";
    let buildDate=new Date().toDateString();
    let dockerFileStr = `    
FROM ${baseImage}
LABEL build_date="${buildDate}"
RUN apt-get -y update
${aptCmds.join("\n")}
${fileCmds.join("\n")}
CMD ["supervisord"]`;
    console.log(dockerFileStr);

    const dockerFile = './' + path.join(buildFolder, "Dockerfile");
    console.log(`dockerFile: ${dockerFile}`);
    await fs.writeFile(dockerFile, dockerFileStr);


    console.log(`build image at ${buildFolder}`);

    const {stdout } = await execDockerCmd(['build', '.', '-t', imageName],{cwd: buildFolder}); //'--no-cache',
    //console.log(`docker build: ${stdout}`);

    /*let stream = await docker.buildImage({
        context: buildFolder,
        src: srcList,
    }, { t: imageName });

    let output = await followProgress(stream);
    let imageID;

    const regex = /^Successfully built ([a-fA-F0-9]+)/
    for (const item of output) {
        if (item.stream) {
            let m = item.stream.match(regex);
            if (m && m[1]) {
                imageID = m[1];
                break;
            }
        }
    }*/

    let imageID;
    const regex = /Successfully built ([a-fA-F0-9]+)/
    let m = stdout.match(regex);
    if (m && m[1]) {
        imageID = m[1];        
    } else {
        console.log(`Build error. Output: ${JSON.stringify(stdout,null,2)}`);
        throw new Error("Unable to build image");
    }

    console.log(`Finished build. imageID: ${imageID}`);
    //console.log(`Finished build`);


    const repo = `${registryURL}/nubo/${imageName}`;
    console.log("tag");
    await execDockerCmd(['image', 'tag', imageName, repo]);
    console.log("push");
    await execDockerCmd(['image', 'push', repo]);

    await fs.rm(buildFolder, { recursive: true });

    return imageName;
}

/**
 * Clean the system from all un-used images.
 * If domain name is provided do that only for the specific domain
 * @param {*} domain 
 */
async function cleanImages(domain) {
    const { Common } = require('./mainModule').get();
    const logger = Common.logger;
    try {
        logger.info(`Running cleanImages job...`);
        if (!initialized) {
            await init();
        }
        // get list of all images assigned to users
        const { Op, fn , col } = require('sequelize');
        let qu = {
            attributes: [
                [fn('DISTINCT', col('docker_image')) ,'docker_image'],
                'orgdomain',                
            ],
            where : {
                docker_image: {
                    [Op.not]: null, // Like: docker_image IS NOT NULL
                },
            }
        }
        if (domain) {
            qu.where.orgdomain = domain;
        }
        let assignedImages = await Common.db.User.findAll(qu);
        let assignedMap = {};
        if (assignedImages) {
            for (const imgObj of assignedImages) {
                if (imgObj.docker_image) {
                    assignedMap[`${imgObj.orgdomain}_${imgObj.docker_image}`] = imgObj;
                }
            }
        } 

        // get all registered images
        let q = {
            attributes: ['maindomain','image_name'],            
        };
        if (domain) {
            q.where = {
                maindomain: domain
            }
        }
        let images = await Common.db.Images.findAll(q);
        if (images) {
            for (const imgObj of images) {
                const key = `${imgObj.maindomain}_${imgObj.image_name}`;
                const assignedObj = assignedMap[key];
                if (!assignedObj) {
                    console.log(`Image ${imgObj.image_name} of domain ${imgObj.maindomain} not found!`);
                    await deleteImageFromRegistry(imgObj.image_name,Common.registryURL,Common.registryUser,Common.registryPassword);
                    try  {
                        await execDockerCmd(['image','rm',`${Common.registryURL}/nubo/${imgObj.image_name}`]);
                    } catch (err) {
                        console.log(`Image delete error. Image: ${Common.registryURL}/nubo/${imgObj.image_name}, Error: ${err}`);
                    }
                    try {
                        await execDockerCmd(['image','rm',imgObj.image_name]);                    
                    } catch (err) {
                        console.log(`Image delete error. Image: ${imgObj.image_name}, Error: ${err}`);
                    }
                    await Common.db.Images.destroy({
                        where : {
                            maindomain : imgObj.maindomain,
                            image_name: imgObj.image_name
                        }
                    });
                    
                } else {

                    //onsole.log(`Image ${assignedObj.docker_image} of domain ${assignedObj.orgdomain} found.`);                    
                    delete assignedMap[key];
                }
            }
        }
        // iterate on all user images that left and insert them to the images table
        for (const key in assignedMap) {
            const imgObj = assignedMap[key];
            console.log(`Image ${imgObj.docker_image} of domain ${imgObj.orgdomain} need to be added to images!`);
            await Common.db.Images.upsert({
                maindomain: imgObj.orgdomain,
                image_name: imgObj.docker_image,
                content_hash: "NA"
            });
        }
    } catch (err) {
        logger.error(`cleanImages error: ${err}`,err);
    }
}

async function uploadApp(req, res) {
    const { Common, CommonUtils, User } = require('./mainModule').get();
    const logger = Common.logger;
    let resultSent = false;
    let packageName;
    let appDetails;
    let maindomain;
    try {
        let adminLogin = req.nubodata.adminLogin;
        if (adminLogin == undefined || adminLogin.getAdminConsoleLogin() != 1) {
            let msg = "Invalid credentials";
            res.send({ status: '0', message: msg });
            return;
        }
        const email = adminLogin.getEmail();
        maindomain = adminLogin.loginParams.mainDomain;
        const registryURL = Common.registryURL;
        const baseImage = `${registryURL}/nubo/${BASE_IMAGE}`;
        let fileName = req.params.fileName;
        packageName = req.params.packageName;
        let app = {
            packagename: packageName,           
        }
        if (fileName) {
            let srcFilePath = CommonUtils.buildPath(Common.nfshomefolder, User.getUserStorageFolder(email), "media/Download/", fileName);
            // copy deb file to local deb folders
            let appsFolder = `./docker_apps`;
            await fs.mkdir(appsFolder, { recursive: true });
            app.appFileName = crypto.randomBytes(32).toString('hex') + ".deb";
            app.appFilePath = path.resolve(path.join(appsFolder, app.appFileName));
            await fs.copyFile(srcFilePath, app.appFilePath);
        }

        appDetails = await fetchAppDetails(app);
        if (!appDetails) {
            throw new Error("Unable to fetch app details");
        }

            
        await updateApkProgress(appDetails.packageName, "", appDetails.versionName, maindomain, appDetails.appName, appDetails.description, COPYING, '');

        let msg = "Install in progress";
        res.send({
            status: 1,
            message: msg,
            packageName: appDetails.packageName,
            versionName: appDetails.versionName,
            versionCode: 1,
            maindomain,
            appName: appDetails.appName
        });
        resultSent = true;
        let savedFileName = '';
        if (app.appFilePath) {
            // copy file to debs folder
            let debsFolder = CommonUtils.buildPath(Common.nfshomefolder, 'debs');
            await fs.mkdir(debsFolder, { recursive: true });
            let foundFile = true;
            let cnt = 0;
            savedFileName = fileName;
            let savedPath;
            let md5new = null;
            do {
                savedPath = path.join(debsFolder, savedFileName);
                try {
                    await fs.stat(savedPath);
                    if (!md5new) {
                        md5new = await md5File(app.appFilePath);
                    }
                    let md5Saved = await md5File(savedPath);
                    if (md5new == md5Saved) {
                        logger.info(`No need to copy file as found existing file with the same content: ${savedFileName}`);
                        break;
                    }
                    cnt++;
                    savedFileName = `${fileName}${cnt}`;
                } catch (se) {
                    foundFile = false;
                }
            } while (foundFile);
            await fs.copyFile(app.appFilePath, savedPath);
        }
        await updateApkProgress(appDetails.packageName, savedFileName, appDetails.versionName, maindomain, appDetails.appName, appDetails.description, FINISHED, '');




        //res.send({ status: '0', message: "Internal error" });
    } catch (err) {
        logger.error(`uploadApp error: ${err}`, err);
        if (!resultSent) {
            res.send({ status: '0', message: `Error: ${err}` });
        } else {
            try {
                if (appDetails) {
                    await updateApkProgress(appDetails.packageName, "", appDetails.versionName, maindomain, appDetails.appName, appDetails.description, ERROR, `${err}`);
                } else {
                    await updateApkProgress(packageName,"","",maindomain,"","", ERROR, `${err}`);
                }
            } catch (err2) {

            }
        }
    }

}

function updateApkProgress(packageName, fileName, versionName, mainDomain, appName, appDescription, status, errorMsg) {
    const { UserUtils } = require('./mainModule').get();
    return new Promise((resolve, reject) => {
        UserUtils.updateAppProgress("deb", packageName, fileName, versionName, 1, mainDomain, appName, appDescription, "0", status, errorMsg, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

async function fetchAppDetails(app) {
    const { Common } = require('./mainModule').get();
    const logger = Common.logger;
    try {
        if (!initialized) {
            await init();
        }
        const registryURL = Common.registryURL;
        const baseImage = `${registryURL}/nubo/${BASE_IMAGE}`;
        let aptShow;
        if (!app.appFilePath && app.packagename) {
            // retrieve info about the package
            const { stdout } = await execDockerCmd(['run', '--rm', '--entrypoint', 'apt-exec.sh',
                baseImage, 'show', app.packagename]);
            aptShow = stdout;
        } else if (app.appFilePath && app.appFileName) {            
            const { stdout } = await execDockerCmd(['run', '--rm', '--entrypoint', 'apt-exec.sh',
                '-v', `${app.appFilePath}:/tmp/${app.appFileName}`,
                baseImage, 'show', `/tmp/${app.appFileName}`]);
            aptShow = stdout;
        } else {
            throw new Error("Invalid parameters. Both app.packagename and app.appFileName are missing");
        }
        
        let debDetails = {};
        const lines = aptShow.split("\n");
        let prevLines = "";
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            if (line[0] == " ") {
                prevLines = "\n" + line[0].trim() + prevLines;
            } else {
                let ind = line.indexOf(":");
                let key = line.substring(0, ind).toLowerCase();
                let value = line.substring(ind + 1).trim() + prevLines;
                prevLines = "";
                if (key)
                    debDetails[key] = value;
            }
        }
        console.log(JSON.stringify(debDetails, null, 2));

        app.packageName = debDetails.package;
        app.versionName = debDetails.version;
        if (!app.appName) {
            app.appName = app.packageName.charAt(0).toUpperCase() + app.packageName.slice(1);
        }
        if (!app.description) {
            app.description = debDetails.description;
        }
        if (!app.packageName || !app.versionName) {
            throw new Error("package or version is missing in deb details");
        }
        return app;
    } catch (err) {
        logger.error(`Error while fetch app details. Error: ${err}`,err);
        // null indicatew that we were unable to retrieve information about this app
        return null;
    }
}

async function attachToDomainDefaultApps(domain) {
    const { Common, CommonUtils } = require('./mainModule').get();
    const logger = Common.logger;
    try {
        let apps = getDefaultApps();
        console.log(JSON.stringify(apps,null,2));
        for (const app of apps) {
            if (app.appFileName) {
                app.appFilePath = CommonUtils.buildPath(Common.nfshomefolder, 'debs',app.appFileName);
            }
            let appDetails = await fetchAppDetails(app);
            if (appDetails) {
                let appFileName = (appDetails.appFileName ? appDetails.appFileName : "");
                await updateApkProgress(appDetails.packageName, appFileName, appDetails.versionName ,domain, appDetails.appName, appDetails.description, FINISHED, '');
            }
        }
    } catch (err) {
        logger.error(`Error adding default apps to domain. Error: ${err}`,err);        
    }
}

async function aptList(req, res) {
    const { Common } = require('./mainModule').get();
    const logger = Common.logger;
    try {
        let adminLogin = req.nubodata.adminLogin;
        if (adminLogin == undefined || adminLogin.getAdminConsoleLogin() != 1) {
            let msg = "Invalid credentials";
            res.send({ status: '0', message: msg });
            return;
        }
        let buildFolder = `./docker_temp`;
        let aptListFile = path.join(buildFolder, 'apt.list');
        let aptList;
        try {
            aptList = await fs.readFile(aptListFile, "utf8");
        } catch (err) {
            aptList = null;
        }
        if (aptList) {
            res.send({
                status: '1',
                message: "Request was fulfilled",
                aptList
            });
            return;
        }

        const registryURL = Common.registryURL;
        const baseImage = `${registryURL}/nubo/${BASE_IMAGE}`;
        if (!initialized) {
            await init();
        }

        // ensure we have the latest version of the image
        await pullImage(baseImage);
        //
        const { stdout } = await execDockerCmd(['run', '--rm', '--entrypoint', 'apt-exec.sh', baseImage, 'list']);

        logger.info(`Fetched apt list..`);
        // ensure folder exists for apt.list file
        await fs.mkdir(buildFolder, { recursive: true });

        // create the apt.list file
        await fs.writeFile(aptListFile, stdout);

        // return content to user
        res.send({
            status: '1',
            message: "Request was fulfilled",
            aptList: stdout
        });




    }
    catch (err) {
        logger.error(`aptList error: ${err}`, err);
        res.send({ status: '0', message: "Internal errors" });
    }

}

module.exports = {
    aptList,
    uploadApp,
    addRemoveAppsForDevices,
    createImageForUser,
    getDefaultApps,
    attachToDomainDefaultApps,
    cleanImages
}