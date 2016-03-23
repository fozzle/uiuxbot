'use strict';

const config = require('./config.json'),
  Bing = require('node-bing-api')({accKey: config.bingKey}),
  Twitter = require('twitter'),
  twitterClient = new Twitter({
    consumer_key: config.twitterConsumerKey,
    consumer_secret: config.twitterConsumerSecret,
    access_token_key: config.twitterAccessToken,
    access_token_secret: config.twitterAccessSecret
  }),
  stream = require('stream'),
  request = require('request'),
  fs = require('fs'),
  gm = require('gm').subClass({imageMagick: true}),
  labels = ["UI", "UX"];

function getImageURLForWord(word) {
  return new Promise((resolve, reject) => {
    Bing.images(word, {size: 'Medium', adult: 'Moderate'}, function(err, res, body) {
      var randomIndex = Math.floor(Math.random() * body.d.results.length),
      resultUrl = body.d.results[randomIndex].MediaUrl;

      if (err || !resultUrl) {
        reject(err);
      } else {
        resolve(resultUrl)
      }
    });
  });
}

function downloadImages(urls) {
  const imagePromises = urls.map((url, index) => {
    const pathComponents = url.split("/"),
        lastPathComponent = pathComponents[pathComponents.length - 1],
        fp = "temp/" + lastPathComponent,
        fsStream = fs.createWriteStream(fp);

    return new Promise((resolve, reject) => {
      request(url).pipe(fsStream).on('close', () => resolve(fp)).on('error', (err) => reject(err));
    });
  });

  return Promise.all(imagePromises);
}

function uploadMedia(filePath) {
  return new Promise(function (resolve, reject) {
    twitterClient.post('media/upload', {
        media: fs.readFileSync(filePath)
      },
      function(error, data, resp) {
        if (error) {
          reject(error);
        } else {
          console.log(data)
          resolve(data.media_id_string);
        }
      });
  });
}

function updateStatus(media_id) {
  return new Promise(function(resolve, reject) {
    twitterClient.post("statuses/update",
      {
        media_ids: media_id
      },
      function(error, data, resp) {
        if (error) {
          console.log("error updating status");
          reject(error);
        } else {
          resolve();
        }
      })
  });
}

function processImages(filePaths) {

  const sizePromises = filePaths.map((filePath) => {
    return new Promise((resolve, reject) => {
      gm(filePath).size(function(err, val) {
        if (err) return reject(err);
        resolve(val);
      });
    })
  });

  const imagePromise = Promise.all(sizePromises).then((sizeVals) => {
    const minHeight = Math.min(sizeVals[0].height, sizeVals[1].height);
    console.log("minHeight: " + minHeight);
    const resizePromises = filePaths.map((filePath, index) => {
      console.log(filePath);
      return new Promise((resolve, reject) => {
        gm(filePath)
        .resize(null, minHeight)
        .write(filePath, function (err) {
          if (err) return reject(err);
          resolve(filePath);
        });
      });
    });

    return Promise.all(resizePromises);

  }).then(() => {
    console.log('get new sizes');
    const sizePromises = filePaths.map((filePath) => {
      return new Promise((resolve, reject) => {
        gm(filePath).size(function(err, val) {
          if (err) return reject(err)
          resolve(val);
        });
      });
    });

    return Promise.all(sizePromises);
  }).then((sizeVals) => {
    console.log(sizeVals);
    const transformPromises = filePaths.map((filePath, index) => {
      return new Promise((resolve, reject) => {
        gm(filePath)
        .font('Impact', 50)
        .fill('#ffffff')
        .stroke('#000000', 2)
        .drawText((sizeVals[index].width/2) - 25, 50, labels[index])
        .write(filePath, function(err) {
          if (err) return reject(err);
          resolve(filePath);
        });
      });
    });

    return Promise.all(transformPromises);
  }).then((filePaths) => {
    return new Promise((resolve, reject) => {
      gm(filePaths[0]).append(filePaths[1], true).write("temp/finished.png", function(err) {
        if (err) return reject(err);
        resolve("temp/finished.png");
      });
    });
  });

  return imagePromise;
}

function getWord() {
  return new Promise(function(resolve, reject) {
    request({
      url: "http://api.wordnik.com:80/v4/words.json/randomWord",
      qs: {
        "includePartOfSpeech": "noun",
        "minCorpusCount": 5000,
        "api_key": config.wordnikKey
      },
      json: true
    }, function(err, res, body) {
        if (err) {
          reject(err);
        } else {
          resolve(body.word);
        }
      });
  });
}

getWord()
  .then((word) => {
    console.log(word);
    return Promise.all([getImageURLForWord(word), getImageURLForWord(word)]);
  })
  .then(downloadImages)
  .then(processImages)
  .then(uploadMedia)
  .then(updateStatus)
  .catch(console.error);
