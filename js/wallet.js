///<reference path="./jquery-1.12.4.min.js" />
"use strict";
$(document).ready(function () {
  //#### VERSION ####
  var version = {
    major: 0,
    minor: 1,
    revision: 1,
    build: 1,
    channel: "alpha"
  }
  var version_str = "" + version.major + "." + version.minor + "." + version.revision;
  if (version.channel) {
    version_str += " " + version.channel;
  }

  //#### CHAINPARAM ####
  const COINBASE_MIN_CONF = 101;
  const RETRY_LOOP = 10; //todo remove this
  var network_name = "mainnet";

  //#### TRANSACTION ####


  //#### WALLET ####
  const STRG = window.localStorage;
  const STRG_KEY = "xpc_browser_wallet";
  const WALLET_DATA_VER = 1;

  const WALLET = {
    version: WALLET_DATA_VER,
    label: "main",
    keyEncrypted: null,
    keyEncInfo: { salt: null, iv: null },
    key: null,//if key is encrypted on memory, this is null
    addr: null,//for get utxo
    utxo: [],//at least 1 conf
    utxo_local: [],//no conf
    balance: 0,//at least 1 conf, unit mocha
    balance_local: 0,//no conf, unit mocha
    sync_at: null,
    discard_key: function () {
      this.keyEncrypted = null;
      this.keyEncInfo = { salt: null, iv: null };
      this.key = null;
      this.addr = null;
      this.utxo = [];
      this.utxo_local = [];
      this.balance = 0;
      this.balance_local = 0;
      this.sync_at = null;
    },
    renew_key: function () {
      try {
        this.discard_key();
        this.key = XPChain.ECPair.makeRandom({ network: window.XPCW.network });
        this.addr = XPChain.payments.p2wpkh({ pubkey: this.key.publicKey, network: window.XPCW.network }).address;

        return true;
      } catch (e) {
        return e;
      }
    },
    has_key: function () {
      if (this.key || this.keyEncrypted) {
        return true;
      } else {
        return false;
      }
    },
    is_encrypted: function () {
      if (this.keyEncrypted) {
        return true;
      }
      return false;
    },
    is_locked: function () {
      return this.is_encrypted() && (!this.key);
    },
    encrypt: function (password) {
      try {
        if (this.is_encrypted()) {
          throw new Error("wallet is alreaady encrypted!");
        }
        if (!password) {
          throw new Error("passphrase is empty!");
        }

        console.log("save encrypted wallet");
        var secret_passphrase = CryptoJS.enc.Utf8.parse(password);
        var salt = CryptoJS.lib.WordArray.random(128 / 8);
        var key128Bits500Iterations =
          CryptoJS.PBKDF2(secret_passphrase, salt, { keySize: 128 / 8, iterations: 500 });
        var iv = CryptoJS.lib.WordArray.random(128 / 8);
        var options = { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 };
        var message_text = CryptoJS.enc.Utf8.parse(this.key.toWIF());
        var encrypted = CryptoJS.AES.encrypt(message_text, key128Bits500Iterations, options);

        this.keyEncrypted = encrypted.toString();
        this.keyEncInfo = {
          salt: CryptoJS.enc.Hex.stringify(salt),
          iv: CryptoJS.enc.Hex.stringify(iv)
        };
        this.key = null;

        return true;
      } catch (e) {
        return e;
      }
    },
    lock: function () {
      if (this.is_encrypted() && this.key) {
        this.key = null;
      }
    },
    unlock: function (password) {
      if (!this.is_locked()) {
        return true;
      }
      try {
        var salt = CryptoJS.enc.Hex.parse(this.keyEncInfo.salt);
        var iv = CryptoJS.enc.Hex.parse(this.keyEncInfo.iv);

        var encrypted_data = CryptoJS.enc.Base64.parse(this.keyEncrypted);
        var secret_passphrase = CryptoJS.enc.Utf8.parse(password);
        var key128Bits500Iterations = CryptoJS.PBKDF2(secret_passphrase, salt,
          { keySize: 128 / 8, iterations: 500 });
        var options = { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 };
        var keyStr = CryptoJS.AES.decrypt({ "ciphertext": encrypted_data }, key128Bits500Iterations, options);
        keyStr = keyStr.toString(CryptoJS.enc.Utf8);

        this.key = XPChain.ECPair.fromWIF(keyStr, window.XPCW.network);
        this.addr = XPChain.payments.p2wpkh({ pubkey: this.key.publicKey, network: window.XPCW.network }).address;

        return true;
      } catch (e) {
        return e;
      }
    },
    unencrypt: function () {
      //set unlocked wallet non-encrypted state
      if (this.is_encrypted()) {
        if (this.key) {
          this.keyEncrypted = null;
          this.keyEncInfo = { salt: null, iv: null };
          return true;
        } else {
          return false;
        }
      }
      return true;
    },
    dump: function (save_to_strg) {
      //save wallet format
      var encrypted = this.is_encrypted();
      var saveKey;
      if (encrypted) {
        saveKey = this.keyEncrypted;
      } else {
        if (!this.key) {
          saveKey = "";
        } else {
          saveKey = this.key.toWIF();
        }
      }

      var o = {
        version: this.version,
        label: this.label,
        enc_info: this.keyEncInfo,
        key: saveKey,
        addr: this.addr
      };
      if (save_to_strg) {
        o.utxo = this.utxo;
        o.utxo_local = this.utxo_local;
        o.balance = this.balance;
        o.balance_local = this.balance_local;
        o.sync_at = this.sync_at;
      }

      return o;
    },
    load: function (data) {
      try {
        var data_obj;
        if (typeof data === "string") {
          data_obj = JSON.parse(data);
        } else {
          data_obj = data;
        }

        switch (data_obj.version) {
          case 1:
            this.version = data_obj.version;
            this.label = data_obj.label || "main";
            this.keyEncInfo = data_obj.enc_info;
            if (this.keyEncInfo.salt && this.keyEncInfo.iv) {
              this.keyEncrypted = data_obj.key;
              this.key = null;
              this.addr = data_obj.addr;
            } else {
              this.keyEncrypted = null;
              this.key = XPChain.ECPair.fromWIF(data_obj.key, window.XPCW.network);
              this.addr = XPChain.payments.p2wpkh({ pubkey: this.key.publicKey, network: window.XPCW.network }).address;
            }
            this.utxo = data_obj.utxo || [];
            this.utxo_local = data_obj.utxo_local || [];
            this.balance = data_obj.balance || 0;
            this.balance_local = data_obj.balance_local || 0;
            this.sync_at = data_obj.sync_at || null;

            //todo move unlock to btn_send, btn_unlockkey
            /*
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
                });
  
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
              keyeePair = XPChain.ECPair.fromWIF(
                key, window.XPCW.network);
                */
            key_loaded();
            break;
          default:
            throw new Error("bad data version: " + data_obj.version);
        }
        return true;
      } catch (e) {
        this.discard_key();
        return e;
      }

    },
    import: function (wif, bip38password) {
      try {
        //todo: bip38
        if (wif.substr(0, 2) === "6P") {
          throw new Error("BIP38 encryption is not implemented yet.");
        }
        this.discard_key();
        this.key = XPChain.ECPair.fromWIF(wif, window.XPCW.network);
        this.addr = XPChain.payments.p2wpkh({ pubkey: this.key.publicKey, network: window.XPCW.network }).address;
      } catch (e) {
        return e;
      }
    },
    coin_select: function (amount_in_mocha) {
      //todo error trap
      var i;
      var selected = [];
      var remain = amount_in_mocha;
      var utxos = Array.from(this.utxo);

      utxos.sort((a, b) => { return a.amount - b.amount; });
      for (i = 0; i < utxos.length; i++) {
        if (!utxos[i].spent){
          selected.push(utxos[i]);
          remain -= utxos[i].amount;
          if (remain <= 0){
            break;
          }
        }
      }

      if (remain > 0){
        return [];
      }

      if (XPCW.debug){
        console.log("utxo selected: " + JSON.stringify(selected));
      }

      return selected;
    }
  }



  //#### UTILITY ####
  function build_tx(pay_params,selected_utxos,actual_size){
    var mywpkh = XPChain.payments.p2wpkh({
      pubkey: WALLET.key.publicKey, network: window.XPCW.network
    });
    var built_tx;
    var fee;
    var size;
    var utxo_amount = sum_amount(selected_utxos);
    var change = utxo_amount - pay_params.amount;

    if (actual_size > 0){
      size = actual_size;
    }else{
      //todo more best estimation!
      size = 500 * (selected_utxos.length + 1);//txins + txouts
    }
    fee = window.XPCW.fee * size;//mocha
    if (pay_params.infee){
      pay_params.amount -= fee;
    }else{
      change -= fee;
    }

    if (change !== 0 && change < window.XPCW.dust) {
      alert("change is too low or insufficient: " + change);//todo remove alert!
      return null;
    }

    var txb = new XPChain.TransactionBuilder(window.XPCW.network);
    var txouts = [];
    var txout;
    var txins = [];
    var txin;

    for (let i = 0; i < selected_utxos.length; i++) {
      txin = txb.addInput(selected_utxos[i].txid, selected_utxos[i].vout, null, mywpkh.output);
      txins.push(txin);
    }
    //for (let i = 0; i < count; i++) {
      txout = txb.addOutput(pay_params.addr, pay_params.amount);
      txouts.push(txout);
    //}
    /*
    var exmsg = "";
    if ($.trim(extra_data.val()) !== "") {
      var data = XPChain.lib.Buffer.from(extra_data.val(), 'utf8');
      var embed = XPChain.payments.embed({ data: [data] });
      var txoutx = txb.addOutput(embed.output, 0);
      exmsg = " and extra data";
    }
    */
    if (change !== 0) {
      txout = txb.addOutput(mywpkh.address, change);
      txouts.push(txout);
    }
    for (let i = 0; i < selected_utxos.length; i++) {
      txb.sign(txins[i], WALLET.key, null, null, selected_utxos[i].amount);
    }
    built_tx = txb.build();
    return built_tx;
  }

  function check_pay_params(pay_params) {
    try {
      //todo address verification (prefix, length).
      if (!pay_params.addr) {
        return { "error": "address", "reason": "is empty" };
      }

      if (isNaN(pay_params.amount) || !isFinite(pay_params.amount) || pay_params.amount < window.XPCW.dust) {
        return { "error": "amount", "reason": "is invalid or dust." };
      }

      if (pay_params.infee !== true && pay_params.infee !== false) {
        return { "error": "infee", "reason": "is indeterminant." };
      }

      return true;
    } catch (e) {
      return { "error": e.toString() };
    }
  }

  function mocha_to_xpc(v) {
    return Math.floor(v) / 10000.0;
  }

  function save_wallet(w) {
    try {
      var strg_data_str = null;
      var strg_data_obj = null;
      strg_data_obj = w.dump(true);
      strg_data_str = JSON.stringify(strg_data_obj);
      STRG.setItem(STRG_KEY, strg_data_str);

      return true;
    } catch (e) {
      return e;
    }
  }

  function sum_amount(utxos){
    var i;
    var v = 0;
    for(i = 0;i<utxos.length;i++){
      v += utxos[i].amount;
    }
    return v;
  }

  function xpc_to_mocha(v) {
    return Math.round(v * 10000);
  }

  //#### UI COMPONENTS ####

  const CONTROLS = {
    btn: {
      myaddr: $("#btn_myaddr"),
      pay: $("#btn_pay"),
      refresh: $("#btn_refresh"),
      updchk: $("#btn_updchk"),
      qrscan_cancel: $("#btn_qrscan_cancel"),
      backup_wallet: $("#btn_backup_wallet"),
      recover_wallet: $("#btn_recover_wallet")
    },
    text: {
      xpc_addr: $("#xpc_addr"),
      xpc_bal: $("#xpc_bal"),
      insight_api_url: $("#insight_api_url")
    },
    panel: {
      qr_container: $("#qr_container")
    },
    plc: {
      script_dynload: $("#script_dynamic_loading")
    },
    tmpl: {
      pay_form: $("#pay_form").get(0).outerHTML
    }
  };
  $("#template").remove();

  //PAY_CONTROLS are initialize and finalize on CONTROLS.btn.pay.click 
  var PAY_CONTROLS = {
    btn: {
      payto_qr: null,
    },
    text: {
      xpc_to: null,
      xpc_amount: null,
    },
    check: {
      xpc_infee: null
    }
  }

  var version_label = $("span.ver");
  var insight_link = $("#insight_url");//todo integrity with insight_api_url

  var btn_impkey = $("#btn_impkey");
  var btn_delkey = $("#btn_delkey");
  var btn_loadkey = $("#btn_loadkey");
  var btn_savekey = $("#btn_savekey");
  var btn_dumpkey = $("#btn_dumpkey");
  var btn_dumpwallet = $("#btn_dumpwallet");
  var btn_genkey = $("#btn_genkey");

  //#### UI FUNCTIONS ####
  function R_DONT_USE(s, apnd) {
    console.log(s);
  }

  function b(o, i) {
    if (i) {
      o.prop("disabled", false);
    } else {
      o.prop("disabled", true);
    }
  }

  function key_loaded() {
    show_wallet_to_ui(WALLET);
    b(btn_delkey, true);
    b(CONTROLS.btn.pay, true);
    b(btn_savekey, true);
    b(btn_dumpkey, true);
  }

  function key_unloaded() {
    sweep_wallet_from_ui();
    b(btn_delkey, false);
    b(CONTROLS.btn.pay, false);
    b(btn_savekey, false);
    b(btn_dumpkey, false);
  }

  function show_wallet_to_ui(w) {
    if (CONTROLS.text.xpc_addr.val() !== w.addr) {
      CONTROLS.text.xpc_addr.val(w.addr);
    }
    //todo if sync_at is recent, show cached balance with black color.
    //otherwise, show cached balance with gray color.
    CONTROLS.text.xpc_bal.val(mocha_to_xpc(w.balance + w.balance_local));
  }

  function sweep_wallet_from_ui() {
    CONTROLS.text.xpc_addr.val("");
    CONTROLS.text.xpc_bal.val("-.----");
  }

  function qrscan_initialize() {
    var cnvs = $("<canvas id='canvas' width='300' height='300'></canvas>");
    cnvs.appendTo(CONTROLS.panel.qr_container);
    CONTROLS.panel.qr_container.show();
    var canvasElement = document.getElementById("canvas");
    window.jsQRLive.initialize(canvasElement);
  }

  function qrscan_finalize() {
    CONTROLS.panel.qr_container.hide();
    window.jsQRLive.scanStop();
    $("#canvas").remove();
  }

  //#### UI HANDLERS ####

  CONTROLS.btn.myaddr.click(function () {
    var addr = $.trim(CONTROLS.text.xpc_addr.val());
    if (addr === "") {
      Swal.fire({
        title: 'Bad address',
        type: 'warning',
        text: 'address is empty!'
      });
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

  CONTROLS.btn.pay.click(function () {
    Swal.fire({
      title: 'Pay XPC',
      html: CONTROLS.tmpl.pay_form,
      showCancelButton: true,
      confirmButtonText: 'Pay',
      onRender: () => {
        //init controls
        PAY_CONTROLS.btn.payto_qr = $("#btn_payto_qr");
        PAY_CONTROLS.btn.payto_qr.qrcode({ width: 48, height: 48, text: 'Q' });
        PAY_CONTROLS.text.xpc_to = $("#xpc_to");
        PAY_CONTROLS.text.xpc_amount = $("#xpc_amount");
        PAY_CONTROLS.check.xpc_infee = $("#xpc_infee");

        //attach events
        PAY_CONTROLS.btn.payto_qr.on("click", payform_btn_payto_qr_click);
      },
      preConfirm: () => {
        //todo unlock if wallet locked.
        var ret;
        var selected_utxos = [];
        var tx;
        var bk_amnt;
        var act_size;
        var paid_fee;
        var pay_params = {
          addr: $.trim(PAY_CONTROLS.text.xpc_to.val()),
          amount: xpc_to_mocha(parseFloat(PAY_CONTROLS.text.xpc_amount.val())),
          infee: PAY_CONTROLS.check.xpc_infee.prop("checked")
        }

        if ((ret = check_pay_params(pay_params)) !== true) {
          //todo parse error and warn
           alert("ERR: bad param: " + JSON.stringify(ret));//todo remove alert!
          return false;
        }

        selected_utxos = WALLET.coin_select(pay_params.amount + 100000);//todo fee...
        if (selected_utxos.length < 1){
          //todo error show
          alert("ERR: insufficient balance!");//todo remove alert!
          return false;
        }

        bk_amnt = pay_params.amount;
        tx = build_tx(pay_params,selected_utxos,-1);
        if (!tx){
          alert("ERR: tx creation error");//todo remove alert!
          return false;
        }
        act_size = tx.virtualSize() + 10;
        paid_fee = act_size * window.XPCW.fee;
        pay_params.amount = bk_amnt;
        tx = build_tx(pay_params,selected_utxos,act_size);//todo margin adjust;
        
        return {
          tx: tx,
          pay_params: pay_params,
          fee: paid_fee
        }
      },
      onClose: () => {
        //detach event
        PAY_CONTROLS.btn.payto_qr.off("click", payform_btn_payto_qr_click);

        //finalize controls
        PAY_CONTROLS.btn.payto_qr = null;
        PAY_CONTROLS.text.xpc_to = null;
        PAY_CONTROLS.text.xpc_amount = null;
        PAY_CONTROLS.check.xpc_infee = null;
      }
    }).then(async (result) => {
      if (result.value) {
        var tx = result.value.tx.toHex();
        var pay_params = result.value.pay_params;
        var fee = result.value.fee;
        var ajaxed = false;

        var sendmsg = "send \n\n";
        sendmsg += mocha_to_xpc(pay_params.amount) + " XPC";
        sendmsg += "(with " + mocha_to_xpc(fee) + " XPC fee";
        if (pay_params.infee){
          sendmsg += " included";
        }else{
          sendmsg += " total " + (mocha_to_xpc(pay_params.amount + fee)); 
        }
        sendmsg += ")\n\nto\n\n" + pay_params.addr + "\n\nproceed ok?"  

        const { value: send_conf } = await Swal.fire({
          title: 'Send Confirm',
          text: sendmsg,
          showCancelButton: true
        });

        if (!send_conf) {
          return false;
        }

        if (!window.XPCW.dryrun) {
          ajaxed = true;
          $.ajax({
            type: 'POST',
            url: CONTROLS.text.insight_api_url.val() + 'tx/send',
            dataType: 'text',
            data: "rawtx=" + tx,
          }).done(function (sendres) {
            var json = JSON.parse(sendres);
            if (json && json.txid) {
              var res_html = "<textarea id='send_result'>txid: " + json.txid;
              if (window.XPCW.debug) {
                res_html += "\nrawtx: " + tx;
              }
              res_html += "</textarea>";
              Swal.fire({
                title: 'Success!',
                type: 'success',
                html: res_html
              }).then(()=>{
                CONTROLS.btn.refresh.click();//todo 
              });
            } else {
              Swal.fire({
                title: 'Failure!',
                type: 'error',
                text: res_html
              });
            }
          }).fail(function (xhr, tstat, err) {
            Swal.fire({
              title: 'Failure!',
              type: 'error',
              text: "" + tstat + ": " + err + " [" + xhr.responseText + "]"
            });
          }).always(function () { b(PAY_CONTROLS.btn.sendtx, true); });
        } else {
          (() => {
            var res_html = "<textarea id='send_result'>rawtx: " + tx + "</textarea>";
            Swal.fire({
              title: 'DRY RUN',
              type: 'info',
              html: res_html
            });
          })();
        }
      }
    });
  });



  CONTROLS.btn.refresh.click(function () {
    var addr = $.trim(CONTROLS.text.xpc_addr.val());
    if (addr === "") {
      Swal.fire({
        title: 'Bad address',
        type: 'warning',
        text: 'address is empty!'
      });
      return false;
    }
    b(CONTROLS.btn.refresh, false);
    try {
      R_DONT_USE("please wait...");

      $.ajax({
        type: 'GET',
        url: CONTROLS.text.insight_api_url.val() + 'addr/' + addr + '/utxoExt',
        dataType: 'json',
      }).done(function (json) {
        if (!Array.isArray(json)) {
          throw "result not Array. insight version mismatch?";
        }
        var i;
        var is_coinbase = false;

        WALLET.balance = 0;
        WALLET.utxo = [];
        WALLET.sync_at = Date.now();

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

        CONTROLS.text.xpc_bal.val(mocha_to_xpc(WALLET.balance + WALLET.balance_local));
        save_wallet(WALLET);
        show_wallet_to_ui(WALLET);
      }).fail(function (xhr, tstat, err) {
        Swal.fire({
          title: 'Refresh Error',
          type: 'error',
          text: 'Refresh failed. " + tstat + ": " + err + " [" + xhr.responseText + "]'
        });
      }).always(function () {
        b(CONTROLS.btn.refresh, true);
      });
    } catch (e) {
      b(CONTROLS.btn.refresh, true);
      Swal.fire({
        title: 'Refresh Error',
        type: 'error',
        text: e.toString()
      });
    }
  });

  btn_impkey.click(async function () {
    try {
      var ret;

      //todo qr scan
      const { value: privkey_wif } = await Swal.fire({
        title: 'Import PrivKey(WIF)',
        input: 'password',
        inputPlaceholder: 'Enter WIF key...',
        inputAttributes: {
          maxlength: 53,
          autocapitalize: 'off',
          autocorrect: 'off'
        }
      });

      if (privkey_wif) {
        if (WALLET.has_key()) {
          const { value: discard_conf } = await Swal.fire({
            title: 'Discard PrivKey',
            text: 'key is already loaded. discard it?',
            showCancelButton: true
          });

          if (!discard_conf) {
            return false;
          }
        }
        //todo implement BIP38 key
        ret = WALLET.import(privkey_wif);
        if (ret !== true) {
          throw ret;
        }
        key_loaded();
      }
    } catch (e) {
      Swal.fire({
        title: 'PrivKey import error',
        type: 'error',
        text: e.toString()
      });
    }
  });
  btn_delkey.click(function () {
    WALLET.discard_key();
    key_unloaded();
  });
  btn_loadkey.click(async function () {
    try {
      var ret;

      if (WALLET.key !== null) {
        const { value: discard_conf } = await Swal.fire({
          title: 'Discard PrivKey',
          text: 'key is already loaded. discard it?',
          showCancelButton: true
        });

        if (!discard_conf) {
          return false;
        }
      }

      ret = WALLET.load(STRG.getItem(STRG_KEY));
      if (ret !== true) {
        throw ret;
      }
      key_loaded();
    } catch (e) {
      WALLET.discard_key();
      key_unloaded();

      Swal.fire({
        title: 'Wallet load error',
        type: 'error',
        text: e.toString()
      });
    }
  });
  btn_savekey.click(async function () {
    var ret = save_wallet(WALLET);
    if (ret !== true) {
      Swal.fire({
        title: 'PrivKey dump error',
        type: 'error',
        text: e.toString()
      });
    }
  });
  btn_dumpkey.click(function () {
    try {
      if (WALLET.key === null) {
        if (WALLET.is_locked()) {
          throw new Error("wallet is locked!");
        } else {
          throw new Error("key is empty!");
        }
      }
      Swal.fire({
        title: 'dump PrivKey(WIF)',
        input: 'textarea',
        inputValue: WALLET.key.toWIF()
      });
    } catch (e) {
      Swal.fire({
        title: 'PrivKey dump error',
        type: 'error',
        text: e.toString()
      });
    }
  });

  btn_dumpwallet.click(function () {
    try {
      Swal.fire({
        title: 'Dump wallet',
        input: 'textarea',
        inputValue: JSON.stringify(WALLET.dump(false))
      });
    } catch (e) {
      Swal.fire({
        title: 'Wallet dump error',
        type: 'error',
        text: e.toString()
      });
    }
  });

  CONTROLS.btn.backup_wallet.click(function () {
    //todo remove dumpwallet?
    try {
      Swal.fire({
        title: 'Backup wallet',
        input: 'textarea',
        inputValue: JSON.stringify(WALLET.dump(false))
      });
    } catch (e) {
      Swal.fire({
        title: 'Wallet backup error',
        type: 'error',
        text: e.toString()
      });
    }
  });

  CONTROLS.btn.recover_wallet.click(function () {
    //todo remove dumpwallet?
    try {
      Swal.fire({
        title: 'Recover wallet',
        input: 'textarea',
        inputValue: ''
      }).then((result)=>{
        if (result.value){
          var ret;
          if ((ret = WALLET.load(result.value))){
            ret = save_wallet(WALLET);
            if (ret !== true) {
              throw ret;
            }
            key_loaded();
            CONTROLS.btn.refresh.click();//todo 
          }else{
            key_unloaded();
            throw ret;
          }
        }
      });
    } catch (e) {
      Swal.fire({
        title: 'Wallet recover error',
        type: 'error',
        text: e.toString()
      });
    }
  });

  btn_genkey.click(async function () {
    try {
      var ret;

      if (WALLET.key !== null) {
        const { value: discard_conf } = await Swal.fire({
          title: 'Discard PrivKey',
          text: 'key is already loaded. discard it?',
          showCancelButton: true
        });

        if (!discard_conf) {
          return false;
        }
      }

      ret = WALLET.renew_key();
      if (!ret) {
        throw ret;
      }
      key_loaded();
    } catch (e) {
      key_unloded();
      Swal.fire({
        title: 'PrivKey generate error',
        type: 'error',
        text: e.toString()
      });
    }
  });

  //version checked
  CONTROLS.plc.script_dynload.on("ver_fetched", function (e, data) {
    console.log("script dynamically loaded.");
    console.log(window.XPCW.latest_version);
    if (version.major < window.XPCW.latest_version.major ||
      version.minor < window.XPCW.latest_version.minor ||
      version.revision < window.XPCW.latest_version.revision ||
      version.build < window.XPCW.latest_version.build) {
      Swal.fire({
        title: "Update available",
        text: "New version found. Update now?",
        showCancelButton: true
      }).then((result) => {
        if (result.value) {
          window.location.reload(true);
        }
      })
    } else {
      Swal.fire({
        title: "Latest version",
        text: "Already up to date."
      })
    }
    b(CONTROLS.btn.updchk, true);
  });

  CONTROLS.btn.updchk.click(function (e) {
    b(CONTROLS.btn.updchk, false);
    var ts = Date.now();
    var se = document.createElement("script");
    se.src = "./js/version.js?ts=" + ts;
    se.id = "scr_ver_fetch";
    document.getElementById(CONTROLS.plc.script_dynload.prop("id")).appendChild(se);
  });

  CONTROLS.btn.qrscan_cancel.click(function (e) {
    qrscan_finalize();
  });

  //#### UI HANDLERS(PAY FORM)####

  var payform_btn_payto_qr_click = (function (e) {
    qrscan_initialize();
    window.jsQRLive.scanOnce().then((result) => {
      if (result) {
        try{
          var adq = result.match(/\w+:(.+?)\?/)[1];
          result = adq;
        }catch(e){
          //do nothing
        }
        PAY_CONTROLS.text.xpc_to.val(result);
      } else {
        //todo read failure?
      }
      qrscan_finalize();
    }, (errobj) => {
      qrscan_finalize();
      Swal.fire({
        title: 'QR Scan Error!',
        type: 'error',
        text: JSON.stringify(errobj)
      });
    });
  });

  //#### INITIALIZE ####
  (function () {
    try {
      var strg_data_str = null;
      var strg_data_obj = null;
      var ret;

      //activate testnet
      if (window.XPCW.network === XPChain.networks.testnet) {
        network_name = "testnet";
        version_str += "(testnet)";
        STRG_KEY += "_testnet";
      }

      //ui default value load
      version_label.text(version_str);
      insight_link.attr("href", window.XPCW.insight_urls[network_name]);
      CONTROLS.text.insight_api_url.val(window.XPCW.insight_api_urls[network_name]);
      //default setting
      if (window.XPCW.defaults && window.XPCW.defaults[network_name]) {
        if (window.XPCW.defaults[network_name].infee === true) {
          xpc_infee.prop("checked", true).attr("checked", "checked");
        }
      }

      CONTROLS.btn.myaddr.qrcode({ width: 48, height: 48, text: 'Q' });
      b(CONTROLS.btn.pay, false);
      b(btn_delkey, false);
      b(btn_savekey, false);
      b(btn_dumpkey, false);
      b(btn_loadkey, true);

      //check existent wallet
      strg_data_str = STRG.getItem(STRG_KEY);
      if (strg_data_str !== null) {
        try {
          strg_data_obj = JSON.parse(strg_data_str);
        } catch (e) {
          strg_data_obj = null;
        }
      }

      if (strg_data_obj === null) {
        //create new wallet - first boot
        WALLET.renew_key();
        ret = save_wallet(WALLET);
        if (ret !== true) {
          throw ret;
        }
        key_loaded();
      } else {
        //auto wallet loading
        //todo wallet versioning...upper compatible or not?
        if (strg_data_obj.version <= WALLET_DATA_VER) {
          ret = WALLET.load(strg_data_str);
          if (ret === true) {
            key_loaded();
          } else {
            Swal.fire({
              title: 'Wallet Load Error',
              type: 'error',
              text: 'wallet loading failed' + ret.toString()
            });
            WALLET.discard_key();
            key_unloaded();
          }
        } else {
          Swal.fire({
            title: 'Unknown Wallet Version',
            type: 'warning',
            text: 'wallet version(' + strg_data_obj.version + ') is higher than supported(' + WALLET_DATA_VER + ').'
          });
        }
      }

      //debug mode
      if (window.XPCW.debug) {
        console.log("%cWARNING: debug mode is activated. it's risky and developers only. ", "color: red;font-size: 20px;");
        window.XPCW.DEBUG_VARS = {
          WALLET: WALLET,
          CONTROLS: CONTROLS,
          STRG: STRG
        }
        $(".debug").removeClass("debug").addClass("debug-ui");
      }
    } catch (e) {
      Swal.fire({
        title: 'Unexpected Error',
        type: 'error',
        text: 'wallet initialize failed.\n' + e.toString()
      });
    }
  })();

});