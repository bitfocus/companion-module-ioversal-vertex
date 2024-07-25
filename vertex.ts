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
		["TimeCode", "RemainingTimeCode", "RemainingCueTime", "CueTime", "NextCue", "CurrentOrLastCue",]
	};
	
	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ConnectionConfig) {
		this.config = config

		this.initTcp()

		this.initVariable()

		this.updateStatus(this.status.Ok)

		this.updateActions() // export Actions
	}

	async destroy() {
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ConnectionConfig) {
		this.config = config
	}

	buildCommand (target: string, command: string, args?: any | null | undefined) {
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
		if (command && self.config && self.socket) {

			if (self.ensureConnection()) {
				self.log('debug', "sending " + command + " to " + self.config.host);
				self.socket.send(command + "\r\n");
			} else {
				self.log('debug', "not connected to host")
			}
		} else {
			self.log('debug', "no command")
		}
	}
	
	updatePollingTarget(target: any) {
		var self = this;
		self.pollingTarget = target;
		self.setVariableValues({'polling_target': target,});
	}

	poll() {
		var self = this;
		if (self.socket) {
		self.socket.send('return CompanionRequest ' + self.pollingTarget + "\r\n");
		}
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

		if (self.socket !== undefined) {
			self.socket.destroy();
			delete self.socket;
		}

		if (self.config && self.config.host) {
			var port = 50009;

			self.socket = new TCPHelper(self.config.host, port);

			self.socket.on('status_change', function (_status: InstanceStatus, _message: any): void {
				self.status.Ok;
			});

			self.socket.on('error', function (err: { message: string }): void {
				self.log('error', "Network error: " + err.message);
			});

			self.socket.on('connect', function (): void {
				self.log('info', "Connected");
				// TODO: what was this even doing?
				// if (self.config.type === 'disp') {
				if (self.socket) {
					self.socket.send('authenticate 1\r\n');
				}
			});

			self.socket.on('data', function (data) {
				self.processIncomingData(data);
			});
		}
	}
	
	ensureConnection() {
		let self = this;
		if (self.socket === undefined) {
			self.initTcp();
		}
		if (self.socket !== undefined && self.socket.isConnected) {
			return true;
		} else {
			self.log('warn', 'Socket not connected');
			return false;
		}
	}

	processIncomingData(data: string | Buffer) {
		var self = this;
		self.log('debug', "Data received: " + data);
		try {
			var parsed = JSON.parse(data.toString());
		} catch (error) {
			self.log('info', 'Unable to parse incoming data as JSON: ' + data);
			return;
		}
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
		var variables = [
			{
				name: 'Polling Target',
				variableId: 'polling_target'
			}
		];

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
