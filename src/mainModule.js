"use strict";
var _ = require('underscore');

var params = {
    Common: null,
    CommonUtils: null,
    UserUtils: null,
    User: null,
    Session: null,
    Settings: null,
    AddAppsToProfiles: null,
    PlatformModule: null,
    NfsModule: null,
}

function get() {
    return params;
}

function set(newParams) {
    _.extend(params, newParams)
}
module.exports = {
    get,
    set
};