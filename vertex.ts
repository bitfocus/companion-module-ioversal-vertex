import {
	CompanionActionDefinitions,
	CompanionInputFieldNumber,
	CompanionInputFieldTextInput,
	InstanceBase,
	InstanceStatus,
	Regex,
	runEntrypoint,
	SomeCompanionConfigField,
	TCPHelper
} from '@companion-module/base';
import { getUpgrades } from './upgrades.js';

export interface ConnectionConfig {
    host: string;
};

class vertexInstance extends InstanceBase<ConnectionConfig> {
	status = InstanceStatus
	config!: ConnectionConfig;
	pollingTarget: any
	socket: TCPHelper | undefined
	pollingTimer: any
	variableNames: any  = {
		"Playback":
		["TimeCode", "RemainingTimeCode", "RemainingCueTime", "CueTime", "NextCue", "CurrentOrLastCue"]
	};
	
	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ConnectionConfig) {
		// Set config for instance, initialize TCP connection and variables and actions.
		this.config = config
		this.initTcp()
		this.initVariable()
		this.updateActions()
	}

	async destroy() {
		// Check if socket is initialized and destroy it.
		if (this.socket !== undefined) {
			this.socket.destroy()
		}
		this.log('debug', 'Cleared connection to Vertex API.')
	}

	async configUpdated(config: ConnectionConfig) {
		// Destroy the present instance and re-initialize with new config-data.
		this.destroy()
		this.init(config)
	}

	buildCommand (target: string, command: string, args?: any | null | undefined) {
		// Re-write command for the Vertex API.
		var result = target + '.' + command;
		if (Array.isArray(args)) {
			result += ' ' + args.join(',');
		} else if (args != null) {
			result += ' ' + args.toString();
		}
		return result;
	}

	updateActions() {
		var self = this
		var cmd: string

		const playbackOptions: CompanionInputFieldNumber = { type: 'number', label: 'Playback Id', id: 'id', default: 1, min: 0, max: Number.MAX_SAFE_INTEGER };
		const scriptOptions: CompanionInputFieldTextInput = { type: 'textinput', label: 'Script', id: 'script', default: '',};
		const cueOptions: CompanionInputFieldNumber = { type: 'number', label: 'Cue Id', id: 'cueId', default: 1, min: 0, max: Number.MAX_SAFE_INTEGER };
		const preloadTimeOptions: CompanionInputFieldNumber = { type: 'number', label: 'Preload Time', id: 'preloadTime', default: 1, min: 0, max: Number.MAX_SAFE_INTEGER };
		const fadeTimeOptions: CompanionInputFieldNumber = { type: 'number', label: 'Fade Time', id: 'fadeTime', default: 1, min: 0, max: Number.MAX_SAFE_INTEGER };
		const targetOptions: CompanionInputFieldTextInput = { type: 'textinput', label: 'Target', id: 'target', default: 'Playback1' };
		const intervalOptions: CompanionInputFieldNumber = { type: 'number', label: 'Interval ms', id: 'interval', default: 100, min: 0, max: Number.MAX_SAFE_INTEGER };

		const actions: CompanionActionDefinitions = {
			['script']: {
				name: 'Run Script',
				options: [playbackOptions, scriptOptions],
				callback: action => {
					if (action.options.script) {
						cmd = action.options.script.toString()
					}
					self.log('debug', "run vertex action: " + action)
					self.sendCmd(cmd)
				}
			},
		
			['play']: {
				name: 'Play',
				options: [playbackOptions],
				callback: action => {
					var playback = 'Playback' + action.options.id
					cmd = self.buildCommand(playback, 'Play')
					self.log('debug', "run vertex action: " + action.actionId)
					self.sendCmd(cmd)
				}
			},
			['pause']: {
				name: 'Pause',
				options: [playbackOptions],
				callback: action => {
					var playback = 'Playback' + action.options.id
					cmd = self.buildCommand(playback, 'Pause')
					self.log('debug', "run vertex action: " + action)
					self.sendCmd(cmd)
				}
			},
			['stop']: {
				name: 'Stop',
				options: [playbackOptions],
				callback: action => {
					var playback = 'Playback' + action.options.id
					cmd = self.buildCommand(playback, 'Stop')
					self.log('debug', "run vertex action: " + action)
					self.sendCmd(cmd)
				}
			},
			['goToCue']: {
				name: 'Go to Cue',
				options: [playbackOptions, cueOptions],
				callback: action => {
					var playback = 'Playback' + action.options.id
					var cueId = action.options.cueId
					cmd = self.buildCommand(playback, 'GotoCue', cueId)
					self.log('debug', "run vertex action: " + action)
					self.sendCmd(cmd)
				}
			},
			['fadeToCue']: {
				name: 'Fade to Cue',
				options: [playbackOptions, cueOptions, preloadTimeOptions, fadeTimeOptions],
				callback: action => {
					var playback = 'Playback' + action.options.id
					var cueId = action.options.cueId
					cmd = self.buildCommand(playback, 'FadeToCue', [cueId, action.options.preloadTime, action.options.fadeTime])
					self.log('debug', "run vertex action: " + action)
					self.sendCmd(cmd)
				}
			},
			['gotoNextCue']: {
				name: 'Go to Next Cue',
				options: [playbackOptions],
				callback: action => {
					var playback = 'Playback' + action.options.id
					cmd = self.buildCommand(playback, 'GotoNextCue')
					self.log('debug', "run vertex action: " + action)
					self.sendCmd(cmd)
				}
			},
			['gotoPreviousCue']: {
				name: 'Go to Previous Cue',
				options: [playbackOptions],
				callback: action => {
					var playback = 'Playback' + action.options.id
					cmd = self.buildCommand(playback, 'GotoPreviousCue')
					self.log('debug', "run vertex action: " + action)
					self.sendCmd(cmd)
				}
			},
			['poll']: {
				name: 'Poll',
				options: [targetOptions],
				callback: action => {
					self.updatePollingTarget(action.options.target);
					cmd = 'return CompanionRequest ' + self.pollingTarget;
					self.log('debug', "run vertex action: " + action)
					self.sendCmd(cmd)
				}
			},
			['update_polling_target']: {
				name: 'Update polling target',
				options: [targetOptions],
				callback: action => {
					self.updatePollingTarget(action.options.target);
					self.log('debug', "run vertex action: " + action)
					self.sendCmd(cmd)
				}
			},
			['start_timer']: {
				name: 'Start Polling Timer',
				options: [targetOptions, intervalOptions],
				callback: action => {
					self.updatePollingTarget(action.options.target);
					cmd = 'return CompanionRequest ' + self.pollingTarget;
					if (action.options.interval) {
						self.startPollingTimer(action.options.interval);
					}
					self.log('debug', "run vertex action: " + action)
					self.sendCmd(cmd)
				}
			},
			['stop_timer']: {
				name: 'Stop Polling Timer',
				options: [],
				callback: action => {
					self.stopPollingTimer()
					self.log('debug', "run vertex action: " + action)
				}
			}
		}

		this.setActionDefinitions(actions)
	}

	sendCmd(command: string | undefined) {
		var self = this

		// Check if command is set and config is present.
		if (command && self.config && self.socket) {
			// Check if connection is present. Sent command to socket.
			if (self.ensureConnection()) {
				self.log('debug', "sending " + command + " to " + self.config.host);
				self.socket.send(command + "\r\n");
			} else {
				self.log('debug', "Not connected to host")
			}
		} else {
			self.log('debug', "No command, configuration or tcp-socket.")
		}
	}
	
	poll() {
		var self = this;
		if (self.socket) {
			self.socket.send('return CompanionRequest ' + self.pollingTarget + "\r\n");
		}
	}

	updatePollingTarget(target: any) {
		var self = this;
		self.pollingTarget = target;
		self.setVariableValues({'polling_target': target});
	}

	// type `any` is kind of hacky but being specific came with type conversion hassle
	startPollingTimer(interval: any) {
		var self = this;
		clearInterval(self.pollingTimer);
		if (typeof interval == 'string') {
			interval = parseFloat(interval);
		};
		self.pollingTimer = setInterval(function () {
			self.poll();
		}, interval);

	}

	stopPollingTimer() {
		var self = this;
		clearInterval(self.pollingTimer);
	}

	initTcp() {
		var self = this;

		// Set status to connection failure in the beginning.
		self.updateStatus(self.status.ConnectionFailure);

		// Destroy socket in case still present.
		if (self.socket !== undefined) {
			self.socket.destroy();
			delete self.socket;
		}

		// Check if config is set and establish connection.
		if (self.config && self.config.host) {
			var port = 50009;
			self.socket = new TCPHelper(self.config.host, port);

			// Log all status changes.
			self.socket.on('status_change', function (_status: InstanceStatus, _message: any): void {
				self.log('info', "Status Change: " + String(_status));
			});

			// Update status in case of connection error.
			self.socket.on('error', function (err: { message: string }): void {
				self.log('error', "Error connecting to Vertex API: " + err.message);
				self.updateStatus(self.status.ConnectionFailure);
			});

			// Update status in case of established connection.
			self.socket.on('connect', function (): void {
				self.log('info', "Connected to Vertex API!");
				self.updateStatus(self.status.Ok);
			});

			// Process data on API call.
			self.socket.on('data', function (data) {
				self.processIncomingData(data);
			});
		}
	}
	
	ensureConnection() {
		let self = this;

		// Try to reconnect in case connection is not established.
		if (self.socket === undefined) {
			self.initTcp();
		}

		// Check status of connection and return proper value.
		if (self.socket !== undefined && self.socket.isConnected) {
			return true;
		} else {
			return false;
		}
	}

	processIncomingData(data: string | Buffer) {
		var self = this;
		self.log('debug', "Data received: " + data);

		// Try to parse data in JSON format.
		try {
			var parsed = JSON.parse(data.toString());
		} catch (error) {
			self.log('info', 'Unable to parse incoming data as JSON: ' + data);
			return;
		}

		// Iterate through data and set variables.
		var targets = self.pollingTarget.split(',').map((s: string) => s.trim()).filter(function (e: { trim: () => { (): any; new(): any; length: number } }) { return e.trim().length > 0; });
		targets.forEach((element: string | number) => {
			self.setTargetVariables(element, parsed);
		});
	}

	setTargetVariables (target: string | number, data: { [x: string]: any }) {
		let self = this;
		let targetData = data[target];
		if (targetData == null) return;
		let targetType = targetData['Type'];
		let targetVariableNames = self.variableNames[targetType];
		if (targetVariableNames == null) return;
		targetVariableNames.forEach((varName: any) => {
			self.setVariableValues({
				[this.buildVarName(targetType, varName)]: targetData[varName],
			});
		});
		
	}

	initVariable() {
		var self = this;
		this.log('debug', "initializing variables");

		// Definition of variables.
		var variables = [
			{
				name: 'Polling Target',
				variableId: 'polling_target'
			}
		];

		// Iterate through and create all variables.
		for (const type in self.variableNames) {
			self.variableNames[type].forEach((value: string) => {
				variables.push({ name: value + " of selected " + type, variableId: self.buildVarName(type, value) });
			});
		}

		self.setVariableDefinitions(variables);
	};

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
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

	buildVarName(type: string, name: string) { return type + '_' + name; };
};

runEntrypoint(vertexInstance, getUpgrades)
