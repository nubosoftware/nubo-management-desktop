const validtypes = ["docker"];

function registerPlatforms() {
    const { Common, PlatformModule } = require('./mainModule').get();
    const logger = Common.logger;

    for (const platformType of validtypes) {        
        registerPlatformType(platformType,logger,PlatformModule);
    }

}

function registerPlatformType(platformType, logger, PlatformModule) {
    try {
        let platformTypeModule = require('./platform_' + platformType + '.js');
        PlatformModule.registerPlatformType(platformType, platformTypeModule);
    } catch (err) {
        logger.error(`Cannot load platform type: ${platformType}`, err);
    }
}

module.exports = {
    registerPlatforms
}