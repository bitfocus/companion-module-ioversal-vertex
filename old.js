var tcp = require('../../tcp');
var instance_skel = require('../../instance_skel');
const { isNull } = require('lodash');
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
	self.initVariables();
	self.init_tcp();
};

instance.prototype.updateConfig = function (config) {
	var self = this;
	self.config = config;
	self.init_tcp();
	self.initVariables();
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
			self.processIncomingData(data);
		});
	}
};

instance.prototype.processIncomingData = function (data) {
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
	var playbackOptions = { type: 'number', label: 'Playback Id', id: 'id', default: '1', };
	var scriptOptions = { type: 'textinput', label: 'Script', id: 'script', default: '',}
	var cueOptions = { type: 'number', label: 'Cue Id', id: 'cueId', default: '1', };
	var preloadTimeOptions = { type: 'number', label: 'Preload Time', id: 'preloadTime', default: '1', };
	var fadeTimeOptions = { type: 'number', label: 'Fade Time', id: 'fadeTime', default: '1', };
	var targetOptions = { type: 'textinput', label: 'Target', id: 'target', default: 'Playback1' };
	var intervalOptions = { type: 'number', label: 'Interval ms', id: 'interval', default: 100 };
	self.system.emit('instance_actions', self.id, {
		'script': {
			label: 'Run Script',
			options: [playbackOptions, scriptOptions]
		},
		'play': {
			label: 'Play',
			options: [playbackOptions]
		},
		'pause': {
			label: 'Pause',
			options: [playbackOptions]
		},
		'stop': {
			label: 'Stop',
			options: [playbackOptions]
		},
		'goToCue': {
			label: 'Go to Cue',
			options: [playbackOptions, cueOptions,]
		},
		'fadeToCue': {
			label: 'Fade to Cue',
			options: [playbackOptions, cueOptions, preloadTimeOptions, fadeTimeOptions,]
		},
		'gotoNextCue': {
			label: 'Go to Next Cue',
			options: [playbackOptions,]
		},
		'gotoPreviousCue': {
			label: 'Go to Previous Cue',
			options: [playbackOptions,]
		},

		'poll': {
			label: 'Poll',
			options: [targetOptions,]
		},
		'update_polling_target': {
			label: 'Update polling target',
			options: [targetOptions,]
		},
		'start_timer': {
			label: 'Start Polling Timer',
			options: [targetOptions, intervalOptions,]
		},
		'stop_timer': {
			label: 'Stop Polling Timer',
		}
	});
};

instance.prototype.action = function (action) {
	var self = this;
	var playback = 'Playback' + action.options.id;
	var cueId = action.options.cueId;

	debug('run vertex action:', action);
	var cmd;
	switch (action.action) {
		case 'script':
			cmd = action.options.script;
			break;
		case 'play':
			cmd = self.buildCommand(playback, 'Play');
			break;
		case 'stop':
			cmd = self.buildCommand(playback, 'Stop');
			break;
		case 'pause':
			cmd = self.buildCommand(playback, 'Pause');
			break;
		case 'goToCue':
			cmd = self.buildCommand(playback, 'GotoCue', cueId);
			break;
		case 'fadeToCue':
			cmd = self.buildCommand(playback, 'FadeToCue', [cueId, action.options.preloadTime, action.options.fadeTime]);
			break;
		case 'gotoNextCue':
			cmd = self.buildCommand(playback, 'GotoNextCue');
			break;
		case 'gotoPreviousCue':
			cmd = self.buildCommand(playback, 'GotoPrevCue');
			break;
		case 'poll':
			self.updatePollingTarget(action.options.target);
			cmd = 'return CompanionRequest ' + self.pollingTarget;
			break;
		case 'update_polling_target':
			self.updatePollingTarget(action.options.target);
			break;
		case 'start_timer':
			self.updatePollingTarget(action.options.target);
			self.startPollingTimer(action.options.interval);
			break;
		case 'stop_timer':
			self.stopPollingTimer();
			break;
	}

	if (cmd !== undefined) {

		if (self.ensureConnection()) {
			self.log('debug', "sending " + cmd + " to " + self.config.host);
			self.socket.send(cmd + "\r\n");
		}
	}
};

instance.prototype.buildCommand = function (target, command, arguments) {
	var self = this;
	var result = target + '.' + command;
	if (Array.isArray(arguments)) {
		result += ' ' + arguments.join(',');
	} else if (arguments != null) {
		result += ' ' + arguments.toString();
	}
	return result;
}

instance.prototype.updatePollingTarget = function (target) {
	var self = this;
	self.pollingTarget = target;
	self.setVariable('polling_target', target);
}

instance.prototype.poll = function () {
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

instance.prototype.ensureConnection = function () {
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

instance.prototype.initVariables = function () {
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

