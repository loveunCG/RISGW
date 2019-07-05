var fs = require('fs'),
	path = require('path'),
	xmlReader = require('read-xml');
const https = require('https');
let m_socket = [];
const { exec, execSync } = require('child_process');

let moment = require('moment');

const optionshttps = {
	key: fs.readFileSync('./sslkeycert/server.key'),
	cert: fs.readFileSync('./sslkeycert/server.crt')
};

var app = https.createServer(optionshttps);
app.listen(5004);
let io = require('socket.io')(app);

let MPPSPATH = process.cwd() + '\\mpps';

const wmlPath = 'H:\\wamp64\\www\\RIS\\assets\\upsxml';

var knex = require('knex')({
	client: 'mysql',
	connection: {
		host: '127.0.0.1',
		user: 'root',
		password: '',
		database: 'pacs/ris'
	}
});

var options = {
	object: false,
	reversible: false,
	coerce: false,
	sanitize: true,
	trim: true,
	arrayNotation: false,
	alternateTextNode: false
};
var parser = require('xml2json');

// check session table and delete unused session.

function checkSessionTable() {
	knex
		.select('*')
		.from('ci_sessions')
		.then(function(rows) {
			for (var key in rows) {
				if (CompareTimeOut(rows[key])) {
					DeleteTableData(rows[key].id);
				} else {
				}
			}
		})
		.catch(function(error) {
			console.error(error);
		});
}
// update session latest time
function CompareTimeOut(currtimeStamp) {
	// console.log(Math.round(Date.now()/1000) - currtimeStamp.timestamp);
	if (Date.now() / 1000 - currtimeStamp.timestamp > 200) {
		return true;
	} else {
		return false;
	}
}
// check session time over and delete session record at session table

function DeleteTableData(session_id) {
	knex('ci_sessions').where('id', session_id).del().then(function(result) {
		console.log(session_id + '   is deleted');
	});
}

//set worklist server

function startDcmOf() {
	var command = 'dcmof -mwl ' + wmlPath + ' -mppsxml ' + MPPSPATH + ' -c dcmof:11116';
	// var command = "dcmof -mwl " + wmlPath + " dcmof:11116";
	console.log(command);
	const child = exec(command, (error, stdout, stderr) => {
		if (error) {
			console.log('this is error', error);
		}
		console.log(stdout);
	});
}

// update mpps status

async function updateMpps(params) {
	var checkQuery = {
		mpps_accession_number: params.mpps_accession_number
	};
	console.log(checkQuery);
	if (!params.hasOwnProperty('mpps_accession_number')) {
		return true;
	}
	knex
		.select('*')
		.from('tbl_mpps')
		.where(checkQuery)
		.then((rows) => {
			// console.log('this is tbl_mpps', rows);
			if (rows.length > 0) {
				// console.log(params);
				knex('tbl_mpps').where(checkQuery).update(params).then((data) => {
					var updateWhere = {
						chc_id: params.mpps_accession_number
					};
					var status = 0;
					if (params.mpps_status == 'IN PROGRESS') {
						status = 1;
					} else if (params.mpps_status == 'COMPLETED') {
						status = 2;
					}
					var updateList = {
						checkup_status: status
					};

					knex('tbl_check_list').where(updateWhere).update(updateList).then((data) => {
						// console.log('update is 1');

						io.emit('updateRoomStatus', {
							chc_id: params.mpps_accession_number,
							status: status
						});
						updateBookingStatus(updateWhere);
					});
				});
			} else {
				// console.log(params);
				knex('tbl_mpps').returning('id').insert(params).then((data) => {
					var updateWhere = {
						chc_id: params.mpps_accession_number
					};
					var status = 0;
					if (params.mpps_status == 'IN PROGRESS') {
						status = 1;
					} else if (params.mpps_status == 'COMPLETED') {
						status = 2;
					}
					var updateList = {
						checkup_status: status
					};
					knex('tbl_check_list').where(updateWhere).update(updateList).then((data) => {
						io.emit('updateRoomStatus', {
							chc_id: params.mpps_accession_number,
							status: status
						});
						updateBookingStatus(updateWhere);
					});
					// console.log(data);
				});
			}
		})
		.catch(function(error) {
			console.error(error);
		});
}

// update booking status

function updateBookingStatus(params) {
	io.emit('notificationMpps', {
		chc_id: params.chc_id
	});
	console.log('this is notification', params);
	knex('tbl_check_list').where(params).select().then((getbkId) => {
		// console.log(getbkId);
		if (getbkId.length < 1) {
			return;
		}
		console.log('this is ', getbkId[0]['chc_booking_id']);
		var booking_id = getbkId[0]['chc_booking_id'];
		knex('tbl_check_list')
			.where({
				chc_booking_id: booking_id
			})
			.select('checkup_status')
			.then((checklistbybkid) => {
				var isCheckup = 0;
				for (var key in checklistbybkid) {
					// console.log('this is checkupStatus', checklistbybkid[key].checkup_status);
					if (checklistbybkid[key].checkup_status == 2) {
						isCheckup++;
					} else {
					}
				}
				if (isCheckup == checklistbybkid.length) {
					knex('tbl_patient_booking')
						.where({
							booking_id: booking_id
						})
						.update({
							booking_status: 2,
							checked_time: moment().format('YYYY-MM-DD h:mm:ss')
						})
						.then((result) => {
							console.log('update', result);
						});
				}
			});
	});
}

// parsing mpps folder and change

function parsingMPPS() {
	fs.readdir(MPPSPATH, (err, files) => {
		if (!files) {
			return;
		}
		for (var key in files) {
			var filePath = MPPSPATH + '\\' + files[key];
			xmlParserToJson(filePath);
		}
	});
}

function scanMpps() {
	fs.watch(MPPSPATH, (eventType, filename) => {
		console.log(`event type is: ${eventType}`);
		if (eventType == 'change') {
			var filePath = MPPSPATH + '\\' + filename;
			setTimeout(function() {
				xmlParserToJson(filePath);
			}, 3000);
		}
	});
}

function xmlParserToJson(params) {
	xmlReader.readXML(fs.readFileSync(params), function(err, data) {
		if (err) {
			console.error(err);
		}
		var mppsJson = parser.toJson(data.content, options);
		var atrrMpps = JSON.parse(mppsJson).dicom.attr;
		var updateDate = {};
		for (var key in atrrMpps) {
			switch (atrrMpps[key].tag) {
				case '00400270':
					for (var index in atrrMpps[key].item.attr) {
						if (atrrMpps[key].item.attr[index].tag == '00080050') {
							updateDate.mpps_accession_number = atrrMpps[key].item.attr[index]['$t'];
						}
					}
					break;
				case '00100020':
					updateDate.mpps_patient_id = atrrMpps[key]['$t'];
					break;
				case '00400252':
					updateDate.mpps_status = atrrMpps[key]['$t'];
					break;
				case '00100010':
					updateDate.mpps_patient_name = atrrMpps[key]['$t'];
					break;
				default:
					break;
			}
		}
		updateMpps(updateDate);
		delectWML(updateDate.mpps_accession_number);
	});
}

function delectWML(params) {
	fs.unlink(wmlPath + '\\' + params + '.xml', (err) => {
		if (err) return;
		console.log('successfully deleted', params);
	});
}
io.on('connection', function(socket) {
	var addedUser = false;
	socket.on('connectThisRoom', (data) => {
		console.log('this is connect room', data);
		socket.deviceId = data.device_id;
		socket.device_doc_name = data.device_doc_name;
		let updateData = {
			device_doc_name: data.device_doc_name,
			room_status: 1
		};
		knex('tbl_device')
			.where({
				id: data.device_id
			})
			.update(updateData)
			.then((data) => {
				console.log(data);
			});
	});

	socket.on('openLessionRoom', (params) => {
		let updateData = {
			lession_status: 1
		};
		let where = {
			lession_id: params.lession_id
		};
		knex('tbl_lession_info').where(where).update(updateData).then((data) => {
			io.emit('notificationLession', { lession_id: params.lession_id, lession_status: 1 });
			console.log(data);
		});
		socket.lession_id = params.lession_id;
	});
	// when the user disconnects.. perform this
	socket.on('disconnect', function() {
		if (socket.hasOwnProperty('deviceId')) {
			let updateData = {
				device_doc_name: '',
				room_status: 0
			};
			knex('tbl_device')
				.where({
					id: socket.deviceId
				})
				.update(updateData)
				.then((data) => {
					console.log(data);
				});
		} else if (socket.hasOwnProperty('lession_id')) {
			let updateData = {
				lession_status: 0
			};
			let where = {
				lession_id: socket.lession_id
			};
			knex('tbl_lession_info').where(where).update(updateData).then((data) => {
				console.log(data);
				io.emit('notificationLession', { lession_id: socket.lession_id, lession_status: 0 });
			});
		}
	});
});
startDcmOf();
parsingMPPS();
scanMpps();
setInterval(checkSessionTable, 10000);
