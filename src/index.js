

function init(params){
    require('./mainModule').set(params);
    params.Common.logger.info(`Initialize Desktop Module`);
    require('./platforms').registerPlatforms();
}

function addPublicServerHandlers(server) {
    const { Common } = require('./mainModule').get();

}

function addPlatformServiceHandlers(server) {
    const { Common } = require('./mainModule').get();    
}

function restGet(req,res) {
    let resDone = false
    if(req.params.requestType === 'uploadDEB') {
        require('./debs').uploadApp(req,res);
        resDone = true;
    } else if (req.params.requestType === 'aptList') {
        require('./debs').aptList(req,res);
        resDone = true;
    }
    return resDone;
}


function handleRestApiRequest(objectType, arg1, arg2, arg3, perms, adminLogin, req, res) {
    const { Common } = require('./mainModule').get();
    const logger = Common.logger;
    let checkPerm = function (perm, accessType) {
        let ret = perms.checkPermission(perm, accessType);
        if (!ret) {
            res.writeHead(403, {
                "Content-Type": "text/plain"
            });
            res.end("403 Forbidden\n");
            logger.info(`403 Forbidden. objectType: ${objectType}, arg1: ${arg1}, arg2: ${arg2}, method: ${req.method}, admin: ${adminLogin.getEmail()}, perms: ${perms.getJSON()}`);
        }
        return ret;
    };
    if (objectType === 'apps') {        
        if (!arg1) {
            if (req.method == "PUT" && req.params.appType == "deb") {
                if (!checkPerm('/apps','w')) return true;
                require('./debs').uploadApp(req,res);
                return true;
            }
        } else {
            if (arg1 == "debs") {
                if (req.method == "GET") {
                    if (!checkPerm('/apps','r')) return true;
                    require('./debs').aptList(req,res);
                    return true;           
                }
            }            
        }
    }
    return false;
}

module.exports = {
    init,
    restGet,
    addPublicServerHandlers,
    addPlatformServiceHandlers,
    handleRestApiRequest,
    debs: require('./debs'),
    parametersMap: require('./parameters-map'),
}