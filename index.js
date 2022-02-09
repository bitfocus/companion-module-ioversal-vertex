var tcp = require('../../tcp');
var instance_skel = require('../../instance_skel');
var debug;
var log;

function instance(system, id, config) {
	var self = this;
	self.variableNames = {
		"Playback":
			["TimeCode", "RemainingTimeCode", "RemainingCueTime", "CueTime", "NextCue", "CurrentOrLastCue",]
	};

	// super-constructor
	instance_skel.apply(this, arguments);

	self.actions(); // export actions

	return self;
}

instance.prototype.init = function () {
	var self = this;

	debug = self.debug;
	log = self.log;
	self.init_variables();
	self.init_tcp();
};

instance.prototype.updateConfig = function (config) {
	var self = this;
	self.config = config;
	self.init_tcp();
	self.init_variables();
};

instance.prototype.init_tcp = function () {
	var self = this;

	if (self.socket !== undefined) {
		self.socket.destroy();
		delete self.socket;
	}

	if (self.config.host) {
		var port = 50009;

		self.socket = new tcp(self.config.host, port);

		self.socket.on('status_change', function (status, message) {
			self.status(status, message);
		});

		self.socket.on('error', function (err) {
			debug("Network error", err);
			self.log('error', "Network error: " + err.message);
		});

		self.socket.on('connect', function () {
			debug("Connected");
			if (self.config.type === 'disp') {
				self.socket.send('authenticate 1\r\n');
			}
		});

		self.socket.on('data', function (data) {
			self.process_incoming_data(data);
		});
	}
};

instance.prototype.process_incoming_data = function (data) {
	var self = this;
	self.log('debug', "Data received: " + data);
	try {
		var parsed = JSON.parse(data);
	} catch (error) {
		self.log('info', 'Unable to parse incoming data as JSON: ' + data);
		return;
	}
	var targets = self.pollingTarget.split(',').map(s => s.trim()).filter(function (e) { return e.trim().length > 0; });
	targets.forEach(element => {
		self.setTargetVariables(element, parsed);
	});
}

instance.prototype.setTargetVariables = function (target, data) {
	let self = this;
	let targetData = data[target];
	if (targetData == null) return;
	let targetType = targetData['Type'];
	let targetVariableNames = self.variableNames[targetType];
	if (targetVariableNames == null) return;
	targetVariableNames.forEach(varName => {
		self.setVariable(self.buildVarName(targetType, varName), targetData[varName]);
	});
}

// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Vertex Instance IP',
			width: 6,
			regex: self.REGEX_IP
		}
	]
};

// When module gets deleted
instance.prototype.destroy = function () {
	var self = this;

	if (self.socket !== undefined) {
		self.socket.destroy();
		self.socket = undefined;
	}
	clearInterval(self.pollingTimer);

	self.log('info', "destroy " + self.id);
};

instance.prototype.actions = function (system) {
	var self = this;
	self.system.emit('instance_actions', self.id, {
		'script': {
			label: 'Run Script',
			options: [{
				type: 'textinput',
				label: 'Script',
				id: 'script',
				default: ''
			}]
		},
		'play': {
			label: 'Play',
			options: [{
				type: 'textinput',
				label: 'Playback Id',
				id: 'id',
				default: '1',
				regex: self.REGEX_NUMBER
			}]
		},
		'pause': {
			label: 'Pause',
			options: [{
				type: 'textinput',
				label: 'Playback Id',
				id: 'id',
				default: '1',
				regex: self.REGEX_NUMBER
			}]
		},
		'poll': {
			label: 'Poll',
			options: [
				{
					type: 'textinput',
					label: 'Target',
					id: 'target',
					default: 'Playback1'
				},
			]
		},
		'start_timer': {
			label: 'Start Polling Timer',
			options: [
				{
					type: 'textinput',
					label: 'Target',
					id: 'target',
					default: 'Playback1'
				},
				{
					type: 'number',
					label: 'Interval ms',
					id: 'interval',
					default: 100
				},
			]
		},
		'stop_timer': {
			label: 'Stop Polling Timer',
		}
	});
};

instance.prototype.action = function (action) {
	var self = this;
	debug('run vertex action:', action);
	var cmd;

	switch (action.action) {
		case 'script':
			cmd = action.options.script;
			break;
		case 'play':
			cmd = 'Playback' + action.options.id + '.Play';
			break;
		case 'pause':
			cmd = 'Playback' + action.options.id + '.Pause';
			break;
		case 'poll':
			self.pollingTarget = action.options.target;
			self.setVariable('polling_target', self.pollingTarget);
			cmd = 'return CompanionRequest ' + self.pollingTarget;
			break;
		case 'start_timer':
			self.pollingTarget = action.options.target;
			self.setVariable('polling_target', self.pollingTarget);
			self.startPollingTimer(action.options.interval);
			break;
		case 'stop_timer':
			self.stopPollingTimer();
			break;
	}

	if (cmd !== undefined) {

		if (self.ensure_connection()) {
			self.log('debug', "sending " + cmd + " to " + self.config.host);
			self.socket.send(cmd + "\r\n");
		}
	}
};

instance.prototype.poll = function (){
	var self = this;
	self.socket.send('return CompanionRequest ' + self.pollingTarget + "\r\n");
}

instance.prototype.startPollingTimer = function (interval) {
	var self = this;
	clearInterval(self.pollingTimer);
	self.pollingTimer = setInterval(function () {
		
		self.poll();

	}, interval);

}

instance.prototype.stopPollingTimer = function (interval) {
	var self = this;
	clearInterval(self.pollingTimer);
}

instance.prototype.ensure_connection = function () {
	self = this;
	if (self.socket === undefined) {
		self.init_tcp();
	}
	if (self.socket !== undefined && self.socket.connected) {
		return true;
	} else {
		self.log('warning', 'Socket not connected');
		return false;
	}
};

instance.prototype.init_variables = function () {
	var self = this;
	log('debug', "initializing variables");
	var variables = [
		{
			label: 'Polling Target',
			name: 'polling_target'
		}
	];

	for (type in self.variableNames) {
		self.variableNames[type].forEach(value => {
			variables.push({ label: value + " of selected " + type, name: self.buildVarName(type, value) });
		});
	}

	self.setVariableDefinitions(variables);
};

instance.prototype.buildVarName = function (type, name) { return type + '_' + name; };

instance_skel.extendedBy(instance);
exports = module.exports = instance;

