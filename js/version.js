"use strict";
(function () {
    window.XPCW = window.XPCW || {};
    window.XPCW.latest_version = {
        major: 0,
        minor: 0,
        revision: 5,
        build: 4,
        channel: "dev",
        fetch_at: Date.now()
    }

    console.log("in dynamic script");

    try {
        $("#scr_ver_fetch").remove();
        $("#script_dynamic_loading").trigger("ver_fetched");
    } catch (e) {
    }
})();