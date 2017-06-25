const request = require('request');
const cheerio = require('cheerio');
const async = require('async');
const arrayUtils = require('./arrayutils.js');
const fs = require('fs');
const host = 'https://yell.dmm.com';
const memberPath = '/apps/member';
const outputDirName = 'output';

function getImgDetailsFromResult(error, response, body) {
	if (error) {
		return [];
	}
	const $ = cheerio.load(body);
	return $('div .timeLine__img').map(
		function(i, element) {
			var me = $(this);
			var detailPagePath = me.parent().attr('href');
			var imgUrl = me.find('img').attr('data-original');
			return { detailPagePath: detailPagePath, imgUrl: imgUrl };
		}
	);
}

function requestPage(memberId, page, callback) {
	var pageUrl = host + memberPath + '/' + memberId + '/' + '?page=' + page;
	request(pageUrl, function (error, response, body) {
		callback(getImgDetailsFromResult(error, response, body));
	});
}

function refineImgDetails(imgDetails) {
	return imgDetails.map(function (idx, imgDetail) {
		var imgUrl = imgDetail.imgUrl;
		imgUrl = imgUrl.substring(0, imgUrl.lastIndexOf("_") + 1)
					+ 1000
					+ imgUrl.substring(imgUrl.lastIndexOf("."), imgUrl.length);
		return { detailPagePath: imgDetail.detailPagePath, imgUrl: imgUrl };
	});
}

function downloadImages(imgDetails, downloadImagesCallback) {
	async.eachLimit(imgDetails, 10,
		function(imgDetail, downloadImageCallback) {
			downloadImage(imgDetail, downloadImageCallback);
		}, function(err) {
			if (err) {
				console.log("Error occurred while downloading images");
			}
			downloadImagesCallback(err);
	});
}

function downloadImage(imgDetail, downloadImageCallback) {
	async.waterfall([
		function (callback) {
			tryDownloadingImage(imgDetail.imgUrl, function (err) {
				if (err) {
					callback(null);
				} else {
					callback('finish');
				}
			});
		}, function (callback) {
			console.log("2");
			downloadImageFromDetailPagePath(imgDetail.detailPagePath, function (imgUrl) {
				if (imgUrl) {
					console.log("imgUrl: " + imgUrl);
					tryDownloadingImage(imgUrl, function (err) {
						console.log("imgUrl: " + imgUrl + ", err: " + err);
						if (err) {
							callback(null);
						} else {
							callback('finish');
						}
					});
				} else {
					callback("Error occurred while retrieving image url from detail page.");
				}
			});
		}
	], function (err, result) {
		downloadImageCallback(!err || err == 'finish' ? null : err);
	});
}

function tryDownloadingImage(imgUrl, downloadImageCallback) {
	async.retry({ times: 10, interval: 300 },
		function(retryCallback) {
			var imgName = imgUrl.substring(imgUrl.lastIndexOf('/') + 1, imgUrl.length);
			var stream = fs.createWriteStream(outputDirName + '/' + imgName);
			var r = request(imgUrl);
			r.on('response', function(response) {
				if (response.statusCode == 200) {
					r.pipe(stream);
				} else {
					retryCallback('404');
				}
			}).on('error', function(error) {
				retryCallback(error);
			});
			stream.on('finish', function() {
				retryCallback(null);
			});
		},
		function(err) {
			downloadImageCallback(err);
		}
	);
}

function downloadImageFromDetailPagePath(detailPagePath, callback) {
	requestDetailPage(detailPagePath, callback);
}

function requestDetailPage(detailPagePath, callback) {
	var detailPageUrl = host + detailPagePath;
	request(detailPageUrl, function (error, response, body) {
		callback(getImgUrlFromDetailPage(error, response, body));
	});
}

function getImgUrlFromDetailPage(error, response, body) {
	if (error) {
		return None;
	}
	const $ = cheerio.load(body);
	return $('div .detail__pic img').attr('src');
}

function downloadPages(memberId, start, end, callback) {
	console.log("Trying to download images from page " + start + " ~ " + end);
	var pages = arrayUtils.range(start, end);
	var containsLastPage = false;

	async.eachLimit(pages, 2,
		function(page, crawlPageCallback) {
			requestPage(memberId, page, function(imgDetails) {
				if (imgDetails.length == 0) {
					containsLastPage = true;
					crawlPageCallback();
					return;
				}
				console.log("Start downloading page: " + page);
				imgDetails = refineImgDetails(imgDetails);
				downloadImages(imgDetails, function (err) {
					if (err) {
						console.log("Error occurred while downloading images");
					}
					crawlPageCallback();
				});
			});
		}, function(err) {
			if (!containsLastPage) {
				console.log("Done downloading pages: " + start + " ~ " + end);
			}
			
			callback(containsLastPage);
			if (err) {
				console.log("err: " + err);
			}
		});
}

if (process.argv.length < 3) {
	console.log("Usage: node app.js MEMBER_ID");
	process.exit(1);
	return;
}
var memberId = process.argv[2];

if (!fs.existsSync(outputDirName)) {
	fs.mkdirSync(outputDirName);
}
var startPage = 1;
var count = 10;
async.forever(
	function (next) {
		downloadPages(memberId, startPage, startPage + count - 1, function(containsLastPage) {
			if (containsLastPage) {
				next("Done");
			} else {
				startPage += count;
				next();
			}
		});
	}, function (error) {
		if (error) {
			console.log("All done.");
		}
	}
);
