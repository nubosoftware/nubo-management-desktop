

function init(params){
    require('./mainModule').set(params);
    params.Common.logger.info(`Initialize Desktop Module`);    
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

module.exports = {
    init,
    restGet,
    addPublicServerHandlers,
    addPlatformServiceHandlers, 
    debs: require('./debs')
}