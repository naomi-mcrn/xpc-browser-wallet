///<reference path="./jquery-1.12.4.min.js" />
"use strict";
$(document).ready(function () {
  //#### VERSION ####
  var version = {
    major: 0,
    minor: 0,
    revision: 5,
    build: 3,
    channel: "dev"
  }
  var version_str = "" + version.major + "." + version.minor + "." + version.revision;
  if (version.channel){
    version_str += " " + version.channel;
  }

  //#### CHAINPARAM ####
  const COINBASE_MIN_CONF = 101;
  const RETRY_LOOP = 10; //todo remove this
  var network_name = "mainnet";

  //#### TRANSACTION ####


  //#### WALLET ####
  var keyPair = null;//todo replace to WALLET.key
  var recentUTXO = [];//todo replace to WALLET.utxo

  const WALLET = {
    key: null, //future use
    utxo: [],//at least 1 conf
    utxo_local: [],//no conf
    balance: 0,//at least 1 conf, unit mocha
    balance_local: 0,//no conf, unit mocha
    sync_at: null
  }

  var strg = window.localStorage;
  var strg_key = "xpc_browser_wallet";
  var strg_data_str = null;
  var strg_data_obj = null;
  var strg_data_ver = 1;

  //#### UTILITY ####
  function xpc_to_mocha(v) {
    return Math.round(v * 10000);
  }

  function mocha_to_xpc(v){
    return Math.floor(v) / 10000.0;
  }

  //#### UI COMPONENTS ####

  const CONTROLS = {
    btn: {
      updchk: $("#btn_updchk")
    },
    plc:{
      script_dynload: $("#script_dynamic_loading")
    }
  };

  var version_label = $("span.ver");
  var insight_link = $("#insight_url");
  var btn_addr_qr = $("#btn_addr_qr");
  var btn_refresh = $("#btn_refresh");
  var btn_impkey = $("#btn_impkey");
  var btn_delkey = $("#btn_delkey");
  var btn_loadkey = $("#btn_loadkey");
  var btn_savekey = $("#btn_savekey");
  var btn_dumpkey = $("#btn_dumpkey");
  var btn_dumpwallet = $("#btn_dumpwallet");
  var btn_genkey = $("#btn_genkey");
  var btn_sendtx = $("#btn_sendtx");
  var result = $("#result");
  var insight_api_url = $("#insight_api_url");
  var xpc_addr = $("#xpc_addr");
  var xpc_bal = $("#xpc_bal");
  var xpc_priv = $("#xpc_priv");
  var xpc_utxo = $("#xpc_utxo");
  var xpc_to = $("#xpc_to");
  var xpc_infee = $("#xpc_infee");
  var xpc_amount = $("#xpc_amount");
  var xpc_amount_title = $("#xpc_amount_title");
  var xpc_count = $("#xpc_count");
  var extra_data = $("#extra_data");


  //#### UI FUNCTIONS ####
  function r(s, apnd) {
    if (apnd === true) {
      result.val(result.val() + "\n" + s)
    } else {
      result.val(s);
    }
  }

  function b(o, i) {
    if (i) {
      o.prop("disabled", false);
    } else {
      o.prop("disabled", true);
    }
  }

  var key_loaded = function () {
    xpc_addr.val(XPChain.payments.p2wpkh({ pubkey: keyPair.publicKey, network: window.XPCW.network }).address);
    b(btn_delkey, true);
    b(btn_sendtx, true);
    b(btn_savekey, true);
    b(btn_dumpkey, true);
  }
  var key_unloaded = function () {
    b(btn_delkey, false);
    b(btn_sendtx, false);
    b(btn_savekey, false);
    b(btn_dumpkey, false);
  }

  //#### UI HANDLERS ####

  btn_addr_qr.click(function () {
    var addr = $.trim(xpc_addr.val());
    if (addr === "") {
      alert("address is empty!");
      return false;
    }
    var qrhtml = $("<div class='qrcode'></div><span class='qraddr'>" + addr + "</span>");
    Swal.fire({
      title: 'deposit address',
      html: qrhtml,
      onRender: () => {
        $(".qrcode").qrcode({ width: 256, height: 256, text: addr });
      }
    });

  });

  btn_refresh.click(function () {
    var addr = $.trim(xpc_addr.val());
    if (addr === "") {
      alert("address is empty!");
      return false;
    }
    b(btn_refresh, false);
    try {
      r("please wait...");

      $.ajax({
        type: 'GET',
        url: insight_api_url.val() + 'addr/' + addr + '/utxoExt',
        dataType: 'json',
      }).done(function (json) {
        if (!Array.isArray(json)) {
          throw "result not Array. insight version mismatch?";
        }
        var i;
        var res = "";
        var amnt_total = 0;
        var amnt_nojust = 0;
        var is_coinbase = false;
        var nojust_txidxs = [];
        var justamnt = parseInt(xpc_amount.val());

        WALLET.balance = 0;
        WALLET.utxo = [];

        //todo remove confirmed utxo from local tx and recalc balance_local

        for (i = 0; i < json.length; i++) {
          is_coinbase = json[i].isCoinBase;
          if ((is_coinbase && json[i].confirmations >= COINBASE_MIN_CONF) || (!is_coinbase && json[i].confirmations >= window.XPCW.min_conf)) {
            WALLET.utxo.push({
              txid: json[i].txid,
              vout: json[i].vout,
              ts: json[i].ts,
              scriptPubKey: json[i].scriptPubKey,
              amount: xpc_to_mocha(json[i].amount), // store by mocha unit.
              confirmations: json[i].confirmations,
              isCoinBase: json[i].isCoinBase
            });
            WALLET.balance += xpc_to_mocha(json[i].amount);
          }
        }

        xpc_bal.val(mocha_to_xpc(WALLET.balance + WALLET.balance_local));

      }).fail(function (xhr, tstat, err) {
        r("Refresh failed. " + tstat + ": " + err + " [" + xhr.responseText + "]");
      });

      /*
      $.ajax({
        type: 'GET',
        url: insight_api_url.val() + 'addr/' + addr + '?noTxList=1',
        dataType: 'json',
      }).done(function (json) {
        console.log("refresh " + addr);
        console.dir(json);
        var tmpval = json["balanceSat"];
        tmpval = parseInt(tmpval);
        if (isNaN(tmpval) || !isFinite(tmpval)) {
          throw new Error("insight returned no numeric value! " + JSON.stringify(json));
        }
        xpc_bal.val(tmpval / 10000.0);



      }).fail(function (xhr, tstat, err) {
        r("Refresh failed. " + tstat + ": " + err + " [" + xhr.responseText + "]");
      });
      */
    } catch (e) {
      r("error: " + e);
    }
    b(btn_refresh, true);
  });

  btn_impkey.click(function () {
    try {
      if (keyPair !== null) {
        if (!confirm("key is already loaded. discard it?")) {
          return false;
        }
      }
      keyPair = XPChain.ECPair.fromWIF(xpc_priv.val(), window.XPCW.network);
      key_loaded();
    } catch (e) {
      keyPair = null;
      alert(e.toString());
    }
    xpc_priv.val("");
  });
  btn_delkey.click(function () {
    keyPair = null;
    key_unloaded();
  });
  btn_loadkey.click(async function () {
    try {
      if (keyPair !== null) {
        if (!confirm("key is already loaded. discard it?")) {
          return false;
        }
      }

      strg_data_str = strg.getItem(strg_key);
      strg_data_obj = JSON.parse(strg_data_str);
      switch (strg_data_obj.version) {
        case 1:
          var enc = strg_data_obj.encrypted;
          var key = strg_data_obj.key;
          var ei = strg_data_obj.enc_info;
          try {
            if (enc) {
              var salt = CryptoJS.enc.Hex.parse(ei.salt);
              var iv = CryptoJS.enc.Hex.parse(ei.iv);

              const { value: password } = await Swal.fire({
                title: 'passphrase for decrypt wallet',
                input: 'password',
                inputPlaceholder: 'Enter passphrase...',
                inputAttributes: {
                  maxlength: 64,
                  autocapitalize: 'off',
                  autocorrect: 'off'
                }
              })

              if (!password) {
                throw new Error("bad passphrase(empty)");
              }

              var encrypted_data = CryptoJS.enc.Base64.parse(key);
              var secret_passphrase = CryptoJS.enc.Utf8.parse(password);
              var key128Bits500Iterations = CryptoJS.PBKDF2(secret_passphrase, salt,
                { keySize: 128 / 8, iterations: 500 });
              var options = { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 };
              key = CryptoJS.AES.decrypt({ "ciphertext": encrypted_data }, key128Bits500Iterations, options);
              key = key.toString(CryptoJS.enc.Utf8);
            }
            keyPair = XPChain.ECPair.fromWIF(
              key, window.XPCW.network);
            key_loaded();
          } catch (e) {
            throw new Error("key load failure: " + e.toString());
          }
          break;
        default:
          throw new Error("bad data version: " + strg_data_obj.version);
      }
    } catch (e) {
      keyPair = null;
      key_unloaded();
      alert(e.toString());
    }
  });
  btn_savekey.click(async function () {
    const { value: password } = await Swal.fire({
      title: 'passphrase for encrypt wallet',
      input: 'password',
      inputPlaceholder: 'Enter passphrase...',
      inputAttributes: {
        maxlength: 64,
        autocapitalize: 'off',
        autocorrect: 'off'
      }
    })

    var saveEnc = false;
    var saveKey = null;
    var savesalt = null;
    var saveiv = null;

    if (password) {
      console.log("save encrypted wallet");
      var secret_passphrase = CryptoJS.enc.Utf8.parse(password);
      var salt = CryptoJS.lib.WordArray.random(128 / 8);
      var key128Bits500Iterations =
        CryptoJS.PBKDF2(secret_passphrase, salt, { keySize: 128 / 8, iterations: 500 });
      var iv = CryptoJS.lib.WordArray.random(128 / 8);
      var options = { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 };
      var message_text = CryptoJS.enc.Utf8.parse(keyPair.toWIF());
      var encrypted = CryptoJS.AES.encrypt(message_text, key128Bits500Iterations, options);

      saveKey = encrypted.toString();
      savesalt = CryptoJS.enc.Hex.stringify(salt);
      saveiv = CryptoJS.enc.Hex.stringify(iv);

      saveEnc = true;
    } else {
      console.log("save plain wallet");
      saveKey = keyPair.toWIF();
    }

    strg_data_obj = {
      version: strg_data_ver,
      encrypted: saveEnc,
      key: saveKey,
      enc_info: { salt: savesalt, iv: saveiv }
    }
    console.dir(strg_data_obj);
    strg_data_str = JSON.stringify(strg_data_obj);
    strg.setItem(strg_key, strg_data_str);
    b(btn_loadkey, true);
  });
  btn_dumpkey.click(function () {
    try {
      if (keyPair === null) {
        throw new Error("key is empty!");
      }
      prompt("copy private key", keyPair.toWIF());
    } catch (e) {
      alert(e.toString());
    }
  });
  btn_dumpwallet.click(function () {
    try {
      strg_data_str = strg.getItem(strg_key);
      strg_data_obj = JSON.parse(strg_data_str);

      Swal.fire({
        title: 'dump wallet',
        input: 'textarea',
        inputValue: strg_data_str
      })
    } catch (e) {
      Swal.fire({
        title: 'no wallet!',
        text: 'any valid wallet data doesn\'t exist.',
        type: 'warning'
      });
    }
  });

  btn_genkey.click(function () {
    try {
      if (keyPair !== null) {
        if (!confirm("key is already loaded. discard it?")) {
          return false;
        }
      }
      keyPair = XPChain.ECPair.makeRandom({ network: window.XPCW.network });
      key_loaded();
    } catch (e) {
      alert(e.toString());
    }
  });

  btn_sendtx.click(function () {
    var size = 1000;//1kB
    var fee = 0.1;//XPC
    var feemsg = "";
    var ajaxed = false;
    b(btn_sendtx, false);
    try {
      var count = 1;
      var amount_send = parseFloat(xpc_amount.val());
      var whole_amount;
      var toaddr = $.trim(xpc_to.val());
      if (isNaN(amount_send) || !isFinite(amount_send) || amount_send < window.XPCW.dust) {
        alert("amount is invalid or dust.");
        return false;
      }
      if (toaddr == "") {
        alert("send to address is empty");
        return false;
      }

      amount_send = xpc_to_mocha(amount_send) / 10000;
      xpc_amount.val(amount_send);
      whole_amount = amount_send * count;

      var utxo_str = xpc_utxo.val();
      var utxo_idx = parseInt(utxo_str);
      var utxo_arr = utxo_str.split(",");
      var tutxo = null;
      var target_utxos = [];
      var target_utxo_indices = [];
      var target_utxo_amount_sum = 0;
      if (utxo_arr.length > 1) {
        //CSV(multiple)
        for (let i = 0; i < utxo_arr.length; i++) {
          utxo_idx = parseInt(utxo_arr[i]);
          if (isNaN(utxo_idx)) {
            alert("Bad UTXO index at " + i + ".");
            return false;
          }
          if (utxo_idx < 0 || utxo_idx >= recentUTXO.length) {
            alert("UTXO index out of range.");
            return false;
          }
          target_utxos.push(recentUTXO[utxo_idx]);
          target_utxo_indices.push(utxo_idx);
          target_utxo_amount_sum += recentUTXO[utxo_idx].amount;
        }
      } else {
        if (isNaN(utxo_idx)) {
          //JSON
          try {
            tutxo = JSON.parse(utxo_str);
            target_utxos.push(tutxo);
            target_utxo_indices.push(0);
            target_utxo_amount_sum += tutxo.amount;
          } catch (e) {
            alert("UTXO is neither index nor valid JSON");
            return false;
          }
        } else {
          //index
          if (utxo_idx < 0 || utxo_idx >= recentUTXO.length) {
            alert("UTXO index out of range.");
            return false;
          }
          target_utxos.push(recentUTXO[utxo_idx]);
          target_utxo_indices.push(utxo_idx);
          target_utxo_amount_sum += recentUTXO[utxo_idx].amount;
        }
      }

      var mywpkh = XPChain.payments.p2wpkh({
        pubkey: keyPair.publicKey, network: window.XPCW.network
      });
      var mywpkh_s = null;
      var built_tx = null;
      var actual_size = -1;

      var rl_remain = RETRY_LOOP;
      while (true) {
        switch (window.XPCW.feetype) {
          case "per":
            fee = Math.round((window.XPCW.fee * size) * 10.0) / 10000.0;
            feemsg = " [" + window.XPCW.fee + "/kB]";
            if (!xpc_infee.prop("checked")) {
              feemsg += " total " + (fee + amount_send);
            } else {
              feemsg += " included";
            }
            break;
          case "fix":
            fee = window.XPCW.fee;
            break;
          default:
            throw new Error("bad fee type!" + window.XPCW.feetype);
        }
        var tmamnt = 0;//total amount (include fee)
        var tmsend = 0;//each send amount
        if (xpc_infee.prop("checked")) {
          tmsend = amount_send - fee;
          tmamnt = amount_send;
        } else {
          tmsend = amount_send;
          tmamnt = amount_send + fee;
        }
        var change;
        change = target_utxo_amount_sum - tmamnt;
        change = xpc_to_mocha(change) / 10000;
        if (change !== 0 && change < window.XPCW.dust) {
          if (window.XPCW.feetype !== "per" || actual_size > 0) {
            if (change < 0) {
              alert("insufficient UTXO(s) amount: " + target_utxo_amount_sum + " < " + tmamnt);
            } else if (change > 0 && change < window.XPCW.dust) {
              alert("change is too low!: " + change);
            }
            return false;
          } else {
            //set temp fee for recalculation...?
            fee = 0.0001;//1 mocha
            tmsend = target_utxo_amount_sum - fee;
            if (tmsend > amount_send) {
              fee += (tmsend - amount_send);
              tmsend = amount_send;
            }
            change = 0;
          }
        }

        var txb = new XPChain.TransactionBuilder(window.XPCW.network);
        var txouts = [];
        var txout;
        var txins = [];
        var txin;
        var txins_s = [];
        var txin_s;
        for (let i = 0; i < target_utxos.length; i++) {
          if (!target_utxos[i].confirmations) {
            alert("UTXO #" + target_utxo_indices[i] + ": has no confirmations. may be orphaned coinbase Tx.");
            return false;
          } else if (target_utxos[i].confirmations < window.XPCW.min_conf) {
            alert("UTXO #" + target_utxo_indices[i] + ": confirmatioins less than minimum (" + window.XPCW.min_conf + ")");
            return false;
          } else if (target_utxos[i].isCoinBase && target_utxos[i].confirmations < COINBASE_MIN_CONF) {
            alert("UTXO #" + target_utxo_indices[i] + ": confirmatioins less than coinbase mature (" + COINBASE_MIN_CONF + ")");
            return false;
          }
          txin = txb.addInput(target_utxos[i].txid, target_utxos[i].vout, null, mywpkh.output);
          txins.push(txin);
        }
        for (let i = 0; i < count; i++) {
          txout = txb.addOutput(toaddr, xpc_to_mocha(tmsend));
          txouts.push(txout);
        }
        var exmsg = "";
        if ($.trim(extra_data.val()) !== "") {
          var data = XPChain.lib.Buffer.from(extra_data.val(), 'utf8');
          var embed = XPChain.payments.embed({ data: [data] });
          var txoutx = txb.addOutput(embed.output, 0);
          exmsg = " and extra data";
        }
        if (change > 0) {
          var txout1;
          txout1 = txb.addOutput(mywpkh.address, xpc_to_mocha(change));
        }
        for (let i = 0; i < target_utxos.length; i++) {
          txb.sign(txins[i], keyPair, null, null, xpc_to_mocha(target_utxos[i].amount));
        }
        built_tx = txb.build();
        actual_size = built_tx.virtualSize();
        if (window.XPCW.feetype === "per" && size !== actual_size) {
          if (actual_size + 1 <= size) {
            break;//1 mocha expensive...?
          }
          size = actual_size;
          rl_remain -= 1;
          if (rl_remain < 0) {
            alert("can't calculate relative fee. set XPCW.feetype to 'fix' and adjust XPCW.fee .");
            return false;
          }
        } else {
          break;
        }
      }

      var tx = built_tx.toHex();
      var sendmsg = "send \n\n";
      sendmsg += amount_send + " XPC";
      sendmsg += "(with " + fee + " XPC fee" + feemsg + ")" + exmsg + "\n\nto\n\n" + toaddr + "\n\nproceed ok?"
      if (confirm(sendmsg) == false) {
        return false;
      }
      if (!window.XPCW.dryrun) {
        $.ajax({
          type: 'POST',
          url: insight_api_url.val() + 'tx/send',
          dataType: 'text',
          data: "rawtx=" + tx,
        }).done(function (sendres) {
          r(sendres);
        }).fail(function (xhr, tstat, err) {
          r("" + tstat + ": " + err + " [" + xhr.responseText + "]");
        }).always(function () { b(btn_sendtx, true); });
      } else {
        r("DRY RUN: raw tx is \n" + tx);
      }
    } catch (e) {
      alert(e.toString());
    } finally {
      if (!ajaxed) { b(btn_sendtx, true); }
    }
  });

  //version checked
  CONTROLS.plc.script_dynload.on("ver_fetched",function(e,data){
    console.log("script dynamically loaded.");
    console.log(window.XPCW.latest_version);
    if (version.major < window.XPCW.latest_version.major ||
      version.minor < window.XPCW.latest_version.minor || 
      version.revision < window.XPCW.latest_version.revision || 
      version.build < window.XPCW.latest_version.build){
      Swal.fire({
        title: "Update available",
        text: "New version found. Update now?",
        showCancelButton: true
      }).then((result) => {
        if (result.value) {
          window.location.reload(true);
        }
      })
    }else{
      Swal.fire({
        title: "Latest version",
        text: "Already up to date."
      })
    }
    b(CONTROLS.btn.updchk, true);
  });

  CONTROLS.btn.updchk.click(function(e){
    b(CONTROLS.btn.updchk,false);
    var ts = Date.now();
    var se = document.createElement("script");
    se.src = "./js/version.js?ts=" + ts;
    se.id = "scr_ver_fetch";
    document.getElementById(CONTROLS.plc.script_dynload.prop("id")).appendChild(se);
  });


  //#### INITIALIZE ####
  (function(){
    if (window.XPCW.network === XPChain.networks.testnet) {
      network_name = "testnet";
      version_str += "(testnet)";
      strg_key += "_testnet";
    }

    version_label.text(version_str);
    insight_link.attr("href", window.XPCW.insight_urls[network_name]);
    insight_api_url.val(window.XPCW.insight_api_urls[network_name]);
    //default setting
    if (window.XPCW.defaults && window.XPCW.defaults[network_name]) {
      if (window.XPCW.defaults[network_name].to) {
        xpc_to.val(window.XPCW.defaults[network_name].to);
      }
      if (window.XPCW.defaults[network_name].amount) {
        xpc_amount.val(window.XPCW.defaults[network_name].amount);
      }
      if (window.XPCW.defaults[network_name].count >= 1) {
        xpc_count.val(window.XPCW.defaults[network_name].count);
      }
      if (window.XPCW.defaults[network_name].infee === true) {
        xpc_infee.prop("checked", true).attr("checked", "checked");
      }
    }
  
    b(btn_delkey, false);
    b(btn_sendtx, false);
    b(btn_savekey, false);
    b(btn_dumpkey, false);
    strg_data_str = strg.getItem(strg_key);
    if (strg_data_str !== null) {
      try {
        strg_data_obj = JSON.parse(strg_data_str);
      } catch (e) {
        strg_data_obj = null;
      }
    }
    if (strg_data_obj === null || strg_data_obj.version < strg_data_ver) {
      b(btn_loadkey, false);
    }  

    if (window.XPCW.debug){
      console.log("%cWARNING: debug mode is activated. it's risky and developers only. ","color: red;font-size: 20px;");
      window.XPCW.DEBUG_VARS = {
        WALLET: WALLET,
        CONTROLS: CONTROLS
      }
    }
  })();

  /*
  btn_utxo.click(function () {
    var addr = $.trim(xpc_addr.val());
    if (addr === "") {
      alert("address is empty!");
      return false;
    }

    b(btn_utxo, false);
    try {
      r("please wait...");
      recentUTXO = [];
      xpc_utxo.val("");

      $.ajax({
        type: 'GET',
        url: insight_api_url.val() + 'addr/' + addr + '/utxoExt',
        dataType: 'json',
      }).done(function (json) {
        if (!Array.isArray(json)) {
          throw "result not Array. insight version mismatch?";
        }
        var i;
        var res = "";
        var amnt_total = 0;
        var amnt_nojust = 0;
        var is_coinbase = false;
        var nojust_txidxs = [];
        var justamnt = parseInt(xpc_amount.val());
        for (i = 0; i < json.length; i++) {
          is_coinbase = json[i].isCoinBase;
          if ((is_coinbase && json[i].confirmations >= COINBASE_MIN_CONF) || (!is_coinbase && json[i].confirmations >= window.XPCW.min_conf)) {
            if (res !== "") { res += "\n"; }
            res += "UTXO #" + i + "\n" + JSON.stringify(json[i]) + "\n";
          }
        }
        r(res);
        xpc_utxo.val("0");

        recentUTXO = json;
      }).fail(function (xhr, tstat, err) {
        r("Get UTXO failed. " + tstat + ": " + err + " [" + xhr.responseText + "]");
      });
    } catch (e) {
      r("error: " + e);
    }
    b(btn_utxo, true);
  });
  */


});