const { InstanceBase, InstanceStatus, Regex, runEntrypoint, TCPHelper } = require('@companion-module/base')
const UpgradeScripts = require('./upgrades')

class vertexInstance extends InstanceBase {
	status = InstanceStatus
	constructor(internal) {
		super(internal)
	}

	async init(config) {
		this.config = config

		this.init_tcp()

		this.updateStatus('ok')

		this.updateActions() // export Actions
	}

	async destroy() {
		this.log('debug', 'destroy')
	}

	async configUpdated(config) {
		this.config = config
	}

	// Return config fields for web config
	getConfigFields() {
		return [
				{
					type: 'textinput',
					id: 'host',
					label: 'Vertex Instance IP',
					width: 6,
					regex: Regex.IP
				}
		]
	}

	buildCommand (target, command, args) {
			var self = this;
			var result = target + '.' + command;
			if (Array.isArray(arguments)) {
				result += ' ' + arguments.join(',');
			} else if (arguments != null) {
				result += ' ' + arguments.toString();
			}
			return result;
	}

	updateActions() {
		const actions = {}
		var self = this

		var playbackOptions = { type: 'number', label: 'Playback Id', id: 'id', default: '1', };
		var scriptOptions = { type: 'textinput', label: 'Script', id: 'script', default: '',}
		var cueOptions = { type: 'number', label: 'Cue Id', id: 'cueId', default: '1', };
		var preloadTimeOptions = { type: 'number', label: 'Preload Time', id: 'preloadTime', default: '1', };
		var fadeTimeOptions = { type: 'number', label: 'Fade Time', id: 'fadeTime', default: '1', };
		var targetOptions = { type: 'textinput', label: 'Target', id: 'target', default: 'Playback1' };
		var intervalOptions = { type: 'number', label: 'Interval ms', id: 'interval', default: 100 };

		var playback = 'Playback' + action.options.id
		var cueId = actions.options.cueId

		actions['script'] = {
			name: 'Run Script',
			options: [playbackOptions, scriptOptions],
			callback: (action) => {
				cmd = action.options.script
			}
		}
		
		actions['play'] = {
			name: 'Play',
			options: [playbackOptions],
			callback: (action) => {
				cmd = self.buildCommand(playback, 'Play')
			}
		}
		actions['pause'] = {
			name: 'Pause',
			options: [playbackOptions],
			callback: (action) => {
				cmd = self.buildCommand(playback, 'Pause')
			}
		}
		actions['stop'] = {
			name: 'Stop',
			options: [playbackOptions],
			callback: (action) => {
				cmd = self.buildCommand(playback, 'Stop')
			}
		}
		actions['goToCue'] = {
			name: 'Go to Cue',
			options: [playbackOptions, cueOptions],
			callback: (action) => {
				cmd = self.buildCommand(playback, 'GotoCue', cueId)
			}
		}
		actions['fadeToCue'] = {
			name: 'Fade to Cue',
			options: [playbackOptions, cueOptions, preloadTimeOptions, fadeTimeOptions],
			callback: (action) => {
				cmd = self.buildCommand(playback, 'FadeToCue', [cueId, action.options.preloadTime, action.options.fadeTime])
				
			}
		}
		actions['gotoNextCue'] = {
			name: 'Go to Next Cue',
			options: [playbackOptions],
			callback: (action) => {
				cmd = self.buildCommand(playback, 'GotoNextCue')
			}
		}
		actions['gotoPreviousCue'] = {
			name: 'Go to Previous Cue',
			options: [playbackOptions],
			callback: (action) => {
				cmd = self.buildCommand(playback, 'GotoPreviousCue')
			}
		}
		actions['poll'] = {
			name: 'Poll',
			options: [targetOptions],
			callback: (action) => {
				self.updatePollingTarget(action.options.target);
				cmd = 'return CompanionRequest ' + self.pollingTarget;
			}
		}
		actions['update_polling_target'] = {
			name: 'Update polling target',
			options: [targetOptions],
			callback: (action) => {
				self.updatePollingTarget(action.options.target);
			}
		}
		actions['start_timer'] = {
			name: 'Start Polling Timer',
			options: [targetOptions, intervalOptions],
			callback: (action) => {
				self.updatePollingTarget(action.options.target);
				self.startPollingTimer(action.options.interval);
			}
		}
		actions['stop_timer'] = {
			name: 'Stop Polling Timer',
			options: [],
			callback: (action) => {
					self.stoPollingTimer()
				}
		}

		if (cmd !== undefined) {

			if (self.ensureConnection()) {
				self.log('debug', "sending " + cmd + " to " + self.config.host);
				self.socket.send(cmd + "\r\n");
			}
		}
	}
	
	updatePollingTarg(target) {
		var self = this;
		self.pollingTarget = target;
		self.setVariable('polling_target', target);
	}

	poll = function () {
		var self = this;
		self.socket.send('return CompanionRequest ' + self.pollingTarget + "\r\n");
	}

	startPollingTimer(interval) {
		var self = this;
		clearInterval(self.pollingTimer);
		self.pollingTimer = setInterval(function () {

			self.poll();

		}, interval);

	}

	stopPollingTimer(interval) {
		var self = this;
		clearInterval(self.pollingTimer);
	}

	init_tcp() {
		var self = this;

		if (self.socket !== undefined) {
			self.socket.destroy();
			delete self.socket;
		}

		if (self.config.host) {
			var port = 50009;

			self.socket = new TCPHelper(self.config.host, port);

			self.socket.on('status_change', function (status, message) {
				self.status.Ok;
			});

			self.socket.on('error', function (err) {
				self.log('error', "Network error: " + err.message);
			});

			self.socket.on('connect', function () {
				self.log("Connected");
				if (self.config.type === 'disp') {
					self.socket.send('authenticate 1\r\n');
				}
			});

			self.socket.on('data', function (data) {
				self.processIncomingData(data);
			});
		}
	}
	
	ensureConnection() {
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
	}

	processIncomingData(data) {
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

	setTargetVariables (target, data) {
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

	initVariable() {
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

	buildVarName(type, name) { return type + '_' + name; };

}

runEntrypoint(vertexInstance, UpgradeScripts)
