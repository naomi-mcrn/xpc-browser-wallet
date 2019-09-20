"use strict";
(function () {
    window.XPCW = window.XPCW || {};
    window.XPCW.latest_version = {
        major: 0,
        minor: 1,
        revision: 0,
        build: 1,
        channel: "alpha",
        fetch_at: Date.now()
    }

    console.log("in dynamic script");

    try {
        $("#scr_ver_fetch").remove();
        $("#script_dynamic_loading").trigger("ver_fetched");
    } catch (e) {
    }
})();