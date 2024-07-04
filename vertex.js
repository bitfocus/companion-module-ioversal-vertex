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

	updateActions() {
		
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
}

runEntrypoint(vertexInstance, UpgradeScripts)
