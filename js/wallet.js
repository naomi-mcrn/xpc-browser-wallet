///<reference path="./jquery-1.12.4.min.js" />
"use strict";
$(document).ready(function () {
  //#### VERSION ####
  var version = {
    major: 0,
    minor: 0,
    revision: 6,
    build: 1,
    channel: "dev"
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
    }
  }



  //#### UTILITY ####
  function xpc_to_mocha(v) {
    return Math.round(v * 10000);
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

  //#### UI COMPONENTS ####

  const CONTROLS = {
    btn: {
      pay: $("#btn_pay"),
      refresh: $("#btn_refresh"),
      updchk: $("#btn_updchk")
    },
    plc: {
      script_dynload: $("#script_dynamic_loading")
    },
    tmpl: {
      pay_form: $("#pay_form").get(0).outerHTML
    }
  };
  $("#template").remove();

  var version_label = $("span.ver");
  var insight_link = $("#insight_url");
  var btn_addr_qr = $("#btn_addr_qr");
  var btn_impkey = $("#btn_impkey");
  var btn_delkey = $("#btn_delkey");
  var btn_loadkey = $("#btn_loadkey");
  var btn_savekey = $("#btn_savekey");
  var btn_dumpkey = $("#btn_dumpkey");
  var btn_dumpwallet = $("#btn_dumpwallet");
  var btn_genkey = $("#btn_genkey");
  var btn_sendtx = $("#btn_sendtx");
  var insight_api_url = $("#insight_api_url");
  var xpc_addr = $("#xpc_addr");
  var xpc_bal = $("#xpc_bal");


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
    b(btn_sendtx, true);
    b(btn_savekey, true);
    b(btn_dumpkey, true);
  }
  
  function key_unloaded() {
    sweep_wallet_from_ui();
    b(btn_delkey, false);
    b(btn_sendtx, false);
    b(btn_savekey, false);
    b(btn_dumpkey, false);
  }

  function show_wallet_to_ui(w){
    if (xpc_addr.val() !== w.addr){
      xpc_addr.val(w.addr);
    }
    //todo if sync_at is recent, show cached balance with black color.
    //otherwise, show cached balance with gray color.
    xpc_bal.val(mocha_to_xpc(w.balance + w.balance_local));
  }

  function sweep_wallet_from_ui(){
    xpc_addr.val("");
    xpc_bal.val("-.----");
  }

  //#### UI HANDLERS ####

  btn_addr_qr.click(function () {
    var addr = $.trim(xpc_addr.val());
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

    var addr_sendto = null;
    var amount_send = 0;
    var fee_include = false;

    Swal.fire({
      title: 'Pay XPC',
      html: CONTROLS.tmpl.pay_form,
      showCancelButton: true,
      confirmButtonText: 'Pay',
      onRender: ()=>{
      
      },
      preConfirm: ()=>{
        return false;
      }
    }).then((result)=>{
      if (result.value){

      }
    });


  });

  CONTROLS.btn.refresh.click(function () {
    var addr = $.trim(xpc_addr.val());
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
        url: insight_api_url.val() + 'addr/' + addr + '/utxoExt',
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

        xpc_bal.val(mocha_to_xpc(WALLET.balance + WALLET.balance_local));
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
    if (ret !== true){
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

  btn_sendtx.click(async function () {
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
        Swal.fire({
          title: 'Bad amount',
          type: 'warning',
          text: 'amount is invalid or dust.'
        });
        return false;
      }
      if (toaddr == "") {
        Swal.fire({
          title: 'Bad send-to address',
          type: 'warning',
          text: 'send-to address is empty!'
        });
        return false;
      }

      amount_send = xpc_to_mocha(amount_send) / 10000;
      xpc_amount.val(amount_send);
      whole_amount = amount_send * count;

      var utxo_str = "TODO_FIX_ME!!";//todo
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
          if (utxo_idx < 0 || utxo_idx >= BADBADBADBADBADBADrecentUTXO.length) {
            alert("UTXO index out of range.");
            return false;
          }
          target_utxos.push(BADBADBADBADBADBADrecentUTXO[utxo_idx]);
          target_utxo_indices.push(utxo_idx);
          target_utxo_amount_sum += BADBADBADBADBADBADrecentUTXO[utxo_idx].amount;
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
          if (utxo_idx < 0 || utxo_idx >= BADBADBADBADBADBADrecentUTXO.length) {
            alert("UTXO index out of range.");
            return false;
          }
          target_utxos.push(BADBADBADBADBADBADrecentUTXO[utxo_idx]);
          target_utxo_indices.push(utxo_idx);
          target_utxo_amount_sum += BADBADBADBADBADBADrecentUTXO[utxo_idx].amount;
        }
      }

      var mywpkh = XPChain.payments.p2wpkh({
        pubkey: WALLET.key.publicKey, network: window.XPCW.network
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
          txb.sign(txins[i], WALLET.key, null, null, xpc_to_mocha(target_utxos[i].amount));
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
          url: insight_api_url.val() + 'tx/send',
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
        }).always(function () { b(btn_sendtx, true); });
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
    } catch (e) {
      Swal.fire({
        title: 'Failure!',
        type: 'error',
        text: e.toString()
      });
    } finally {
      if (!ajaxed) { b(btn_sendtx, true); }
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
      insight_api_url.val(window.XPCW.insight_api_urls[network_name]);
      //default setting
      if (window.XPCW.defaults && window.XPCW.defaults[network_name]) {
        if (window.XPCW.defaults[network_name].infee === true) {
          xpc_infee.prop("checked", true).attr("checked", "checked");
        }
      }

      b(btn_delkey, false);
      b(btn_sendtx, false);
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
        if (ret !== true){
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
      }else{
        $(".debug").hide();
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