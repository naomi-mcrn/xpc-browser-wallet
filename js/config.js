"use strict";
(function () {
    window.XPCW = window.XPCW || {};
    Object.defineProperty(window.XPCW, 'debug', {
        value: true,
        writable: false
    });//must be false. true is only for development!
    Object.defineProperty(window.XPCW, 'network', {
        value: XPChain.networks.xpchain,
        writable: false
    });//`xpchain` for mainnet, `testnet` for testnet
    window.XPCW.fee = 0.1000;//XPC (fixed or per kB fee);
    window.XPCW.feetype = "per";//per,fix,auto(disabled now)
    window.XPCW.dust = 0.0546;//XPC, less than it is dust!
    window.XPCW.dryrun = false;//don't send really if true
    window.XPCW.min_conf = 1;//require confirmation equal or greater than this 

    //insight urls (auto switch)
    window.XPCW.insight_urls = {
        mainnet: "https://insight.xpchain.io/",
        testnet: "https://cvmu.jp/insight/xpc-test/"
    }
    window.XPCW.insight_api_urls = {
        mainnet: "https://insight.xpchain.io/api/",
        testnet: "https://cvmu.jp/insight/xpc-test/api/"
    }

    //default value: to,amount,count,infee,mode
    window.XPCW.defaults = {
        mainnet: {
            infee: false,
        },
        testnet: {
            infee: true,
        }
    }
})();
