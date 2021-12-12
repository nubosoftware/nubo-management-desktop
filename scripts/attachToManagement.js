"use strict";
/**
 * attachToManagement
 * Attach the enterprise module to management to enable build of management edition
 */

const path = require('path');
const fs = require('fs').promises;
const { program } = require('commander');
program.version('0.0.1');
program
  .option('-m, --management <path>', 'nubomanagement path');
program.parse(process.argv);

const options = program.opts();
console.log(options);

async function main() {
    try {
        // calcuate the module path
        const mpath = path.resolve(__dirname,"..");
        console.log(`Desktop module path: ${mpath}`);

        // get management path
        let mgmtpath;
         if (options.management) {
            mgmtpath = path.resolve(options.management);
        } else {
            mgmtpath = path.resolve(mpath,"..");
        }
        console.log(`Management path: ${mgmtpath}`);

        // change the package json file to include enterprise dependency
        const packageFile = path.join(mgmtpath,"package.json");
        let packageJson = await readJSONFile(packageFile);
        if (packageJson.name != "nubomanagement") {
            throw new Error("Not found the correct module in package.json");
        }
        if (packageJson.dependencies['nubo-management-desktop']) {
            console.error("Desktop module already exists. Abort script");
            return;
        }
        packageJson.dependencies['nubo-management-desktop'] = `file:${mpath}`;
        await writeJSONFile(packageFile,packageJson);


        const moduleLoaderCode=`

        /**
         * desktopModuleLoader
         * Dynamically load desktop module code.
         * Auto generated code - Do not commit this file!!
         */
        
        let desktop = null;
        
        function get() {
            if (!desktop) {
                desktop = require('nubo-management-desktop');
            }
            return desktop;
        }
        
        function init() {
            get().init({
                Common: require('./common'),
                CommonUtils: require("./commonUtils.js"),
                UserUtils: require("./userUtils.js"),
                User: require("./user.js"),
                Session: require('./session').Session,
                Settings: require('./settings'),
                AddAppsToProfiles: require('./ControlPanel/addAppsToProfiles'),
                PlatformModule: require('./platform'),
                NfsModule: require('./nfs'),
            });
        }
        
        
        module.exports = {
            get,
            init
        }               
`;
        const moduleLoaderFile = path.join(mgmtpath,"src/desktopModuleLoader.js")
        await fs.writeFile(moduleLoaderFile, moduleLoaderCode);

        console.log(`
        
        Desktop module has been attached to nubomanagemnet. The following files have changed:
        
        ${packageFile}
        ${moduleLoaderFile}
        
        Please do not commit the changes of those files!

        Please run 'npm install' to install packages.
        `);





        
    } catch (err) {
        console.error(`Error: ${err}`,err);
    }
}

async function readJSONFile(file) {    
    const str = await fs.readFile(file, "utf8");
    const obj = JSON.parse(str);
    return obj;
}

async function writeJSONFile(file, obj) {    
    const str = JSON.stringify(obj, null, 4);
    await fs.writeFile(file, str);
}


main();