var constraints = require("nubo-validateConstraints")(false);


function getParameterMapRules() {
    const rules = [
        
    ];
    console.log(`getParameterMapRules. return ${rules.length} rules!`);
    return rules;
}

function getAuthFilterExcludes() {
    let excludeList = {
        'SESSID': {            
        },
        'ISADMIN': {            
        },
        'PLATUID': {           
        },
        'CONTROL_PANEL_ID': {            
        },
        'NUBO_SETTINGS_ID': {          
        },
        'LOGINTOKEN': {           
        },
        'FRONTEND_AUTH': {           
        },
        'WEB_ADMIN_TOKEN': {
        }
    };
    const controlPanelList = {        
    }

    const excludePlatformList = {        
    };

    const settingsList = {       
    }

    for (var key in controlPanelList) {
        excludeList['LOGINTOKEN'][key] = controlPanelList[key];
        excludeList['PLATUID'][key] = controlPanelList[key];
        excludeList['NUBO_SETTINGS_ID'][key] = controlPanelList[key];
        excludeList['FRONTEND_AUTH'][key] = controlPanelList[key];
        excludeList['WEB_ADMIN_TOKEN'][key] = controlPanelList[key];
    }

    for (var key in excludePlatformList) {
        excludeList['ISADMIN'][key] = excludePlatformList[key];
        excludeList['SESSID'][key] = excludePlatformList[key];
        excludeList['LOGINTOKEN'][key] = excludePlatformList[key];
        excludeList['FRONTEND_AUTH'][key] = excludePlatformList[key];
    }
    for (var key in settingsList) {
        excludeList['ISADMIN'][key] = settingsList[key];
        excludeList['LOGINTOKEN'][key] = settingsList[key];
        excludeList['PLATUID'][key] = settingsList[key];
        excludeList['FRONTEND_AUTH'][key] = settingsList[key];
    }
    return excludeList;
}
module.exports = {
    getParameterMapRules,
    getAuthFilterExcludes
}