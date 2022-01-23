"use strict";

var process = require("process");
var async = require('async');


var execFile = require('child_process').execFile;

var start_platform = function(platform, platType, callback) {
    const { Common, NfsModule, PlatformModule } = require('./mainModule').get();
    const logger = Common.logger;
    var ssh = null;
    var PlatformDesc;
    var vmStatus;
    var platformExistFlag = false;
    // After virtual machine will been created and available with ssh, this function will been called
    // This function start android and call back when android finish boot
    function post_create(callback) {
        var nfs;
        async.series([
                function(callback) {                    
                    platform.waitServiceRun(60, callback);                    
                },                
                function(callback){
                    platform.params.gatewayid = 0;
                    platform.save(callback);
                },
                function(callback) {
                    NfsModule(
                        {
                            nfs_idx: Common.nfsId || 1
                        },
                        function(err, nfsobj) {
                            if (err) {
                                logger.error("Cannot create nfs obect err: " + err);
                                callback(err);
                                return;
                            }

                            nfs = nfsobj;
                            callback(null);
                        }
                    );
                },
                function(callback) {
                    var gwParams = {
                        apps_port: 1111,
                        external_ip: null,
                        player_port: null,
                        ssl: null,
                        index: null,
                        internal_ip: '1.1.1.1',
                        isGWDisabled: null,
                        controller_port: 1111
                    };

                    logger.info("post startPlatform");

                    var descPlatform = {
                        platType: "docker",
                        registryURL: Common.registryURL,
                        registryUser: Common.registryUser,
                        registryPassword: Common.registryPassword,
                        platid: platform.params.platid,
                        platUID: platform.params.platUID,
                        gateway: gwParams,
                        management: {
                            url: Common.internalurl,
                            ip: Common.internalip[0]
                        },
                        nfs: nfs.params,
                        downloadFilesList: [
                        ],
                        settings: {
                            hideControlPanel : Common.hideControlPanel,
                            withService : Common.withService,
                            additionalSettings: Common.platformSettings
                        }
                    };
                    if(Common.platformParams.rsyslog) descPlatform.rsyslog = Common.platformParams.rsyslog;
                    logger.info(`descPlatform: ${JSON.stringify(descPlatform,null,2)}`);
                    platform.startPlatform(descPlatform, function(err) {
                        console.log(`platform.startPlatform. err: ${err}`);
                        callback(err);
                    });
                }
            ], function(err) {
                if (ssh)
                    ssh.end();
                callback(err);
            }
        ); // async.series
    } // function post_create


    var timeout = false;
    async.waterfall([
            function(callback) {
                PlatformModule.getStaticPlatformParams(platform.params.platid).then(res => {
                    PlatformDesc = res;
                    callback(null);
                }).catch(err => {
                    callback(err);
                });                
            },
            function(callback) {
                platform.params.platform_ip = PlatformDesc.ip;
                platform.params.ssh_port = PlatformDesc.ssh_port;
                callback(null);
            }, function(callback) {
                post_create(callback);
            }
        ],
        function(err, results) {
            if (err) {
                console.log("Start platform err: ", err);
                if(!PlatformDesc) {
                    callback(err, platform);
                } else {
                    stop_platform(platform, platType, function(err1) {
                        callback(err, platform);
                    });
                }
            } else {
                callback(err, platform);
            }
        }
    ); // async.series
};


var stop_platform = function(platform, platType, callback) {
    const { Common, PlatformModule } = require('./mainModule').get();
    const logger = Common.logger;
    async.waterfall([
            function(callback) {
                if (platform.params.platform_ip) {
                    callback(null, {
                        platid: platform.params.platid, 
                        ip: platform.params.platform_ip, 
                        ssh_port: platform.params.ssh_port,
                        platUID: platform.params.platUID
                    });
                } else {                   
                    PlatformModule.getStaticPlatformParams(platform.params.platid).then(res => {
                        callback(null, res);
                    }).catch(err => {
                        callback(err);
                    });
                }
            },
            function(PlatformDesc,callback) {
                platform.sendKillPlatform(PlatformDesc, function(err) {callback(err);});
            }            
        ], function(err, results) {
            if (err) {
                logger.info("Error during platformn shotdown: " + err);
            } else {
                logger.info("Platform " + platform.params.platid + " shotdowned successfully");
            }
            if (callback)
                callback(err, platform);
        }
    ); // async.series
};



module.exports = {
    start_platform,
    stop_platform
};
