///<reference path="./jquery-1.12.4.min.js" />
"use strict";
$(document).ready(function () {
  var keyPair = null;
  var suppKeyPair = null;
  var recentUTXO = [];
  var suppUTXO = [];
  var justifyAmnts = null;
  var mode = "simple";

  var COINBASE_MIN_CONF = window.ISPV.coinbase_min_conf || 101;

  function r(s,apnd) {
    if (apnd === true){
      result.val(result.val() + "\n" + s)
    }else{
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

  function change_mode(){
    //todo remove this
  }

  function xpc_to_mocha(v) {
    return Math.round(v * 10000);
  }

  var key_loaded = function () {
    xpc_addr.val(XPChain.payments.p2wpkh({ pubkey: keyPair.publicKey, network: window.ISPV.network }).address);
    if (mode === "justifier" && suppKeyPair !== null){
      xpc_addr_supp.val(XPChain.payments.p2wpkh({ pubkey: suppKeyPair.publicKey, network: window.ISPV.network }).address);
    }
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

  var version_label = $("span.ver");
  var insight_link = $("#insight_url");
  var btn_utxo = $("#btn_utxo");
  var btn_refresh = $("#btn_refresh");
  var btn_impkey = $("#btn_impkey");
  var btn_delkey = $("#btn_delkey");
  var btn_loadkey = $("#btn_loadkey");
  var btn_savekey = $("#btn_savekey");
  var btn_dumpkey = $("#btn_dumpkey");
  var btn_genkey = $("#btn_genkey");
  var btn_sendtx = $("#btn_sendtx");
  var rdo_modes = $("input[name=mode]");
  var result = $("#result");
  var insight_api_url = $("#insight_api_url");
  var xpc_addr = $("#xpc_addr");
  var xpc_bal = $("#xpc_bal");
  var xpc_addr_supp = $("#xpc_addr_supp");  
  var xpc_priv = $("#xpc_priv");
  var xpc_priv_sup = $("#xpc_priv_sup");
  var xpc_utxo = $("#xpc_utxo");
  var xpc_to = $("#xpc_to");
  var xpc_infee = $("#xpc_infee");
  var xpc_amount = $("#xpc_amount");
  var xpc_amount_title = $("#xpc_amount_title");
  var xpc_count = $("#xpc_count");
  var extra_data = $("#extra_data");
  var strg = window.localStorage;
  var strg_key = "xpc_browser_wallet";
  var strg_data_str = null;
  var strg_data_obj = null;
  var strg_data_ver = 1;

  var RETRY_LOOP = 10;
  var VERSION_STR = "0.0.1 dev";
  var network_name = "mainnet";
  if (window.ISPV.network === XPChain.networks.testnet) {
    network_name = "testnet";
    VERSION_STR += "(testnet2)";
    strg_key += "_testnet";
  }
  version_label.text(VERSION_STR);
  insight_link.attr("href", window.ISPV.insight_urls[network_name]);
  insight_api_url.val(window.ISPV.insight_api_urls[network_name]);
  //default setting
  if (window.ISPV.defaults && window.ISPV.defaults[network_name]){
    if (window.ISPV.defaults[network_name].to){
      xpc_to.val(window.ISPV.defaults[network_name].to);
    }
    if (window.ISPV.defaults[network_name].amount){
      xpc_amount.val(window.ISPV.defaults[network_name].amount);
    }
    /*
    if (window.ISPV.defaults[network_name].mode){
      mode = window.ISPV.defaults[network_name].mode;
    }
    */
    if (window.ISPV.defaults[network_name].count >= 1){
      xpc_count.val(window.ISPV.defaults[network_name].count);
    }
    if (window.ISPV.defaults[network_name].infee === true){
      xpc_infee.prop("checked",true).attr("checked","checked");
    }
  }
  rdo_modes.prop("checked",false).removeAttr("checked");
  $("#mode_" + mode).prop("checked",true).attr("checked","checked");
  change_mode();

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

  var privkey_hash = window.location.hash.substr(1);
  if ($.trim(privkey_hash) !== "") {
    try {
      keyPair = XPChain.ECPair.fromWIF(
        privkey_hash, window.ISPV.network);
      key_loaded();
      alert("private key imported from URL fragment!(experimental)");
    } catch (e) {
      keyPair = null;
      console.error(e);
    }
  }

  btn_utxo.click(function () {
    var addr = $.trim(xpc_addr.val());
    var addr_supp = $.trim(xpc_addr_supp.val());
    if (addr === "") {
      alert("address is empty!");
      return false;
    }
    if (mode === "justifier" && addr_supp === ""){
      alert("supp. address is empty!");
      return false;
    }

    b(btn_utxo, false);
    try {
      r("please wait...");
      recentUTXO = [];
      xpc_utxo.val("");
      justifyAmnts = null;

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
        if (mode === "justifier"){
          if (isNaN(justamnt) || justamnt <= 0){
            throw new Error("justify amount is invalid.");
          }
        }
        for (i = 0; i < json.length; i++) {
          is_coinbase = json[i].isCoinBase;
          if ((is_coinbase && json[i].confirmations >= COINBASE_MIN_CONF) || (!is_coinbase && json[i].confirmations >= window.ISPV.min_conf)){
            if (res !== "") { res += "\n"; }
            res += "UTXO #" + i + "\n" + JSON.stringify(json[i]) + "\n";
            if (mode === "justifier"){
              if (json[i].amount % justamnt !== 0){
                amnt_nojust += json[i].amount;
                nojust_txidxs.push(i);
              }
              amnt_total += json[i].amount;
            }
          }
        }
        if (mode !== "justifier"){
          r(res);
          xpc_utxo.val("0");
        }else{
          r("Total amount: " + amnt_total + "\nNot justified: " + amnt_nojust);
          if (amnt_nojust < 1){
            alert("All Txs are justified.");
            return;
          }
          xpc_utxo.val(nojust_txidxs.join(","));
        }
        recentUTXO = json;


        if (mode === "justifier"){
          $.ajax({
            type: 'GET',
            url: insight_api_url.val() + 'addr/' + addr_supp + '/utxoExt',
            dataType: 'json',
          }).done(function (json_s) {
            if (!Array.isArray(json_s)) {
              throw "result not Array. insight version mismatch?";
            }
            var amnt_total_supp = 0;
            var tsputxo = [];
            for (i = 0; i < json_s.length; i++) {
              is_coinbase = json_s[i].isCoinBase;
              if ((is_coinbase && json_s[i].confirmations >= COINBASE_MIN_CONF) || (!is_coinbase && json_s[i].confirmations >= window.ISPV.min_conf)){
                tsputxo.push(json_s[i]);
                amnt_total_supp += json_s[i].amount;                
              }
            }
            r("Supp. amount: " + amnt_total_supp, true);

            var remm = amnt_nojust % justamnt;
            if (remm + amnt_total_supp < justamnt){
              alert("supp. amount insufficient.");
              return;
            }
            amnt_total_supp = (remm + amnt_total_supp) - justamnt;//change amount(without fee);

            justifyAmnts = {
              supp: amnt_total_supp,
              count: Math.ceil(amnt_nojust / justamnt)
            }
            
            suppUTXO = tsputxo;    
          }).fail(function (xhr, tstat, err) {
            r("Get Supp. UTXO failed. " + tstat + ": " + err + " [" + xhr.responseText + "]",true);
          });    
        }

      }).fail(function (xhr, tstat, err) {
        r("Get UTXO failed. " + tstat + ": " + err + " [" + xhr.responseText + "]");
      });
    } catch (e) {
      r("error: " + e);
    }
    b(btn_utxo, true);
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
        url: insight_api_url.val() + 'addr/' + addr + '/balance',
        dataType: 'json',
      }).done(function (json) {
        var tmpval = json;
        tmpval = parseInt(tmpval);
        if (isNaN(tmpval) || !isFinite(tmpval)){
          throw new Error("insight returned no numeric value! " + JSON.stringify(json));
        }
        xpc_bal.val(tmpval / 10000.0);
      }).fail(function (xhr, tstat, err) {
        r("Refresh failed. " + tstat + ": " + err + " [" + xhr.responseText + "]");
      });
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
      keyPair = XPChain.ECPair.fromWIF(
        xpc_priv.val(), window.ISPV.network);
      key_loaded();
      if (mode === "justifier" && $.trim(xpc_priv_sup.val()) !== ""){
        try{
          suppKeyPair = XPChain.ECPair.fromWIF(
            xpc_priv_sup.val(), window.ISPV.network);
          key_loaded();
        }catch(e){
          suppKeyPair = null;
          alert("suppKey: " + e.toString());
        }
      }
    } catch (e) {
      keyPair = null;
      suppKeyPair = null;
      alert(e.toString());
    }
    xpc_priv.val("");
    xpc_priv_sup.val("");
  });
  btn_delkey.click(function () {
    keyPair = null;
    suppKeyPair = null;
    key_unloaded();
  });
  btn_loadkey.click(function () {
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
          var skey = strg_data_obj.supp_key;
          var ei = strg_data_obj.enc_info;
          try{
            if (!enc) {
              keyPair = XPChain.ECPair.fromWIF(
                key, window.ISPV.network);
              if (mode === "justifier" && skey && $.trim(skey) !== ""){
                suppKeyPair = XPChain.ECPair.fromWIF(
                  skey, window.ISPV.network);
              }
            } else {
              var salt = CryptoJS.enc.Hex.parse(ei.salt);
              var iv = CryptoJS.enc.Hex.parse(ei.iv);
              var pass = prompt("input passphrase", "");
              if (pass == null || pass == "") {
                throw new Error("bad passphrase(empty)");
              }
              //todo continue...
            }
            key_loaded();
          }catch(e){
            throw new Error("key load failure: " + e.toString());
          }
          break;
        default:
          throw new Error("bad data version: " + strg_data_obj.version);
      }
    } catch (e) {
      keyPair = null;
      suppKeyPair = null;
      key_unloaded();
      alert(e.toString());
    }
  });
  btn_savekey.click(function () {
    strg_data_obj = {
      version: strg_data_ver,
      encrypted: false,
      key: keyPair.toWIF(),
      supp_key: null,
      enc_info: { salt: null, iv: null }
    }
    if (mode === "justifier" && suppKeyPair !== null){
      strg_data_obj.supp_key = suppKeyPair.toWIF();
    }
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
      if (mode === "justifier" && suppKeyPair !== null){
        prompt("copy supp. private key", suppKeyPair.toWIF());
      }
    } catch (e) {
      alert(e.toString());
    }
  });
  btn_genkey.click(function () {
    if (!confirm("currently, generate new key is EXPERIMETAL and DANGEROUS!! (weak randomness). are you ok?")){
      return false;
    }
    try {
      if (keyPair !== null) {
        if (!confirm("key is already loaded. discard it?")) {
          return false;
        }
      }
      keyPair = XPChain.ECPair.makeRandom({ network: window.ISPV.network });
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
      if (mode === "justifier" && justifyAmnts === null){
        alert("Justifier not ready. get UTXO first.");
        return false;
      }
      var count = -1;
      switch (mode) {
        case "simple":
          count = 1;
          break;
        case "splitter":
          count = parseInt(xpc_count.val());
          break;
        case "justifier":
          count = justifyAmnts.count;
          break;
      }

      var amount_send = parseFloat(xpc_amount.val());
      var whole_amount;
      var toaddr = $.trim(xpc_to.val());
      if (mode === "justifier"){
        toaddr = XPChain.payments.p2wpkh({ pubkey: keyPair.publicKey, network: window.ISPV.network }).address;
      }
      if (isNaN(amount_send) || !isFinite(amount_send) || amount_send < window.ISPV.dust) {
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
          if (isNaN(utxo_idx)){
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
        pubkey: keyPair.publicKey, network: window.ISPV.network
      });
      var mywpkh_s = null;
      if (mode === "justifier"){
        mywpkh_s = XPChain.payments.p2wpkh({
          pubkey: suppKeyPair.publicKey, network: window.ISPV.network
        });
      }
      var built_tx = null;
      var actual_size = -1;

      var rl_remain = RETRY_LOOP;
      while (true) {
        switch (window.ISPV.feetype) {
          case "per":
            fee = Math.round((window.ISPV.fee * size) * 10.0) / 10000.0;
            feemsg = " [" + window.ISPV.fee + "/kB]";
            if (mode === "simple"){
              if (!xpc_infee.prop("checked")) {
                feemsg += " total " + (fee + amount_send);
              } else {
                feemsg += " included";
              }
            }
            break;
          case "fix":
            fee = window.ISPV.fee;
            break;
          default:
            throw new Error("bad fee type!" + window.ISPV.feetype);
        }
        var tmamnt = 0;//total amount (include fee)
        var tmsend = 0;//each send amount
        switch (mode) {
          case "simple":
            if (xpc_infee.prop("checked")) {
              tmsend = amount_send - fee;
              tmamnt = amount_send;
            }else{
              tmsend = amount_send;
              tmamnt = amount_send + fee;
            }
            break;       
          case "splitter":
            tmsend = amount_send;
            tmamnt = whole_amount + fee; //tmamnt must be equal or less than UTXO amount.
            break;
          case "justifier":
            tmsend = amount_send;
            tmamnt = fee;//subtract from supp. balance
            break;
        }
        var change;
        if (mode !== "justifier"){
          change = target_utxo_amount_sum - tmamnt;
        }else{
          change = justifyAmnts.supp - tmamnt;
        }       
        change = xpc_to_mocha(change) / 10000;
        if (change !== 0 && change < window.ISPV.dust) {
          if (window.ISPV.feetype !== "per" || actual_size > 0) {
            if (change < 0) {
              alert("insufficient UTXO(s) amount: " + target_utxo_amount_sum + " < " + tmamnt);
            } else if (change > 0 && change < window.ISPV.dust) {
              alert("change is too low!: " + change);
            }
            return false;
          } else {
            //set temp fee for recalculation...?
            fee = 0.0001;//1 mocha
            if (mode === "simple"){
              tmsend = target_utxo_amount_sum - fee;
              if (tmsend > amount_send) {
                fee += (tmsend - amount_send);
                tmsend = amount_send;
              }
            }
            change = 0;
          }
        }

        var txb = new XPChain.TransactionBuilder(window.ISPV.network);
        var txouts = [];
        var txout;
        var txins = [];
        var txin;
        var txins_s = [];
        var txin_s;
        for (let i = 0; i < target_utxos.length; i++) {
          if (!target_utxos[i].confirmations){
            alert("UTXO #" + target_utxo_indices[i] + ": has no confirmations. may be orphaned coinbase Tx.");
            return false;
          }else if(target_utxos[i].confirmations < window.ISPV.min_conf){
            alert("UTXO #" + target_utxo_indices[i] + ": confirmatioins less than minimum (" + window.ISPV.min_conf + ")");
            return false;
          }else if(target_utxos[i].isCoinBase && target_utxos[i].confirmations < COINBASE_MIN_CONF){
            alert("UTXO #" + target_utxo_indices[i] + ": confirmatioins less than coinbase mature (" + COINBASE_MIN_CONF + ")");
            return false;
          }
          txin = txb.addInput(target_utxos[i].txid, target_utxos[i].vout, null, mywpkh.output);
          txins.push(txin);
        }
        if (mode === "justifier"){
          //suppUTXO satisfied min_conf
          for (let i = 0; i < suppUTXO.length; i++){
            txin_s = txb.addInput(suppUTXO[i].txid, suppUTXO[i].vout, null, mywpkh_s.output);
            txins_s.push(txin_s);
          }
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
          if (mode !== "justifier"){
            txout1 = txb.addOutput(mywpkh.address, xpc_to_mocha(change));
          }else{
            txout1 = txb.addOutput(mywpkh_s.address, xpc_to_mocha(change));
          }
        }
        for (let i = 0; i < target_utxos.length; i++) {
          txb.sign(txins[i], keyPair, null, null, xpc_to_mocha(target_utxos[i].amount));
        }
        if (mode === "justifier"){
          for (let i = 0; i < suppUTXO.length; i++){
            txb.sign(txins_s[i], suppKeyPair, null, null, xpc_to_mocha(suppUTXO[i].amount));
          }
        }
        built_tx = txb.build();
        actual_size = built_tx.virtualSize();
        if (window.ISPV.feetype === "per" && size !== actual_size) {
          if (actual_size + 1 <= size){
            break;//1 mocha expensive...?
          }
          size = actual_size;
          rl_remain -= 1;
          if (rl_remain < 0){
            alert("can't calculate relative fee. set ISPV.feetype to 'fix' and adjust ISPV.fee .");
            return false;
          }
        } else {
          break;
        }
      }

      var tx = built_tx.toHex();
      var sendmsg = "send \n\n" 
      switch (mode) {
        case "simple":
          sendmsg += amount_send + " XPC";
          break;
        case "splitter":
          sendmsg += whole_amount + " XPC <@" + amount_send + " XPC * " + count + "> ";
          break;
      }
      sendmsg += "(with " + fee + " XPC fee" + feemsg + ")" + exmsg + "\n\nto\n\n" + toaddr + "\n\nproceed ok?"
      if (confirm(sendmsg) == false) {
        return false;
      }
      if (!window.ISPV.dryrun) {
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

  rdo_modes.change(function (){
    mode = $(this).val();
    change_mode();
  })
});