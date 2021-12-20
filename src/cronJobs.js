

var jobs = {
    CLEAN_IMAGES: 10,    
};

function runJob(command, params, logger, callback) {
    if (command == jobs.CLEAN_IMAGES) {
        cleanImages(logger, callback);
        return true;
    }    
    return false;
}

function cleanImages(logger, callback) {
    require('./debs').cleanImages().then(() => {
        callback(null);
    }).catch(err => {
        logger.error("cleanImages: " + err);
        callback('cleanImages failed');
    });    
}


module.exports = {
    jobs,
    runJob
}