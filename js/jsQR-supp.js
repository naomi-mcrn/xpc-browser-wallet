"use strict";
//jsqr supp library
((_export) => {

  var video, canvas, loadingMessage, canvasElement;
  var scanPromise = null;
  var scanMode = "continue";
  var scanResolver = null;
  var scanRejector = null;
  var scanStream = null;
  var scanResults = [];
  var scanStopFlag = false;

  function initialize(cvs) {
    //cvs is raw html element e.g. document.getElementById("canvas")
    canvasElement = cvs;
    video = document.createElement("video");
    canvas = canvasElement.getContext("2d");
    loadingMessage = document.getElementById("jsQRMsg");
    loadingMessage.innerText = "Error: can't access camera."
  }

  function stopstream(strm) {
    strm.getTracks().forEach(function (track) {
      track.stop();
    });
  }

  function scan() {
    scanStopFlag = false;
    scanPromise = null;
    if (scanStream !== null) {
      stopstream(scanStream);
      scanStream = null;
    }
    // Use facingMode: environment to attemt to get the front camera on phones
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(function (stream) {
      scanStream = stream;
      video.srcObject = scanStream;
      video.setAttribute("playsinline", true); // required to tell iOS safari we don't want fullscreen
      video.play();
      loadingMessage.innerText = "Initialize..."
      requestAnimationFrame(tick);
    });
  }

  function scanContinue(sr) {
    if (sr) {
      scanResults = sr;
    } else {
      scanResults = [];
    }
    scanMode = "continue";
    scan();
    return scanResults;
  }

  function scanOnce() {
    scanMode = "once";
    scan();
    scanPromise = new Promise((resolve, reject) => {
      scanResolver = resolve;
      scanRejector = reject;
    });
    return scanPromise;
  }

  function scanStop() {
    scanStopFlag = true;
  }

  _export.jsQRLive = {
    initialize: initialize,
    scanOnce: scanOnce,
    scanContinue: scanContinue,
    scanStop: scanStop
  }

  function drawLine(begin, end, color) {
    canvas.beginPath();
    canvas.moveTo(begin.x, begin.y);
    canvas.lineTo(end.x, end.y);
    canvas.lineWidth = 4;
    canvas.strokeStyle = color;
    canvas.stroke();
  }

  function tick() {
    try {
      if (scanStopFlag) {
        if (scanMode === "once") {
          scanResolver(null);
        }
        stopstream(scanStream);
        scanStream = null;
        canvasElement.hidden = true;
        return;
      }

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        loadingMessage.hidden = true;
        canvasElement.hidden = false;

        var ofsx = (video.videoWidth - canvasElement.width) / 2;
        var ofsy = (video.videoHeight - canvasElement.height) / 2;

        canvas.drawImage(video, ofsx, ofsy, canvasElement.width, canvasElement.height,0,0,canvasElement.width, canvasElement.height);
        var imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
        var code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        if (code) {
          drawLine(code.location.topLeftCorner, code.location.topRightCorner, "#FF3B58");
          drawLine(code.location.topRightCorner, code.location.bottomRightCorner, "#FF3B58");
          drawLine(code.location.bottomRightCorner, code.location.bottomLeftCorner, "#FF3B58");
          drawLine(code.location.bottomLeftCorner, code.location.topLeftCorner, "#FF3B58");

          if (scanMode === "once") {
            scanResolver(code.data);
            stopstream(scanStream);
            scanStream = null;
            canvasElement.hidden = true;
            return;//stop scanning
          } else {
            scanResults.push(code.data);
          }
        }
      }
      requestAnimationFrame(tick);
    } catch (e) {
      if (scanMode === "once") {
        scanRejector(e);
      }
      stopstream(scanStream);
      scanStream = null;
      return;
    }
  }
})(window);