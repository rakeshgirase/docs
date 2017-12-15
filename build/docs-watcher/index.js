var chokidar = require("chokidar"),
	fs = require("fs-extra"),
	path = require("path"),
	childProcess = require("child_process"),
	exec = childProcess.exec,
	execSync = childProcess.execSync;

var root = path.join(__dirname, "..");
var contentPath = `${root}/bin/Content`;
var distRoot = `${root}/bin/site`;

var docsRoot = `${root}/../docs`;
var modulesRoot = `${root}/../../NativeScript`;
var nativescriptAngularRoot = `${root}/../../nativescript-angular`;
var sdkExamplesRoot = `${root}/../../nativescript-sdk-examples-ng`;
var sidekickRoot = `${root}/../../sidekick-docs`;


var watching = true;
var syncing = true;

var sourcePaths = [{
	basePath: path.normalize(docsRoot)
}, {
	basePath: path.normalize(modulesRoot),
	distPaths: [`${modulesRoot}/bin/dist/./snippets`, `${modulesRoot}/bin/dist/./cookbook`],
	buildScript: `${modulesRoot}/build-docs.sh`
}, {
	basePath: path.normalize(nativescriptAngularRoot),
	distPaths: [`${nativescriptAngularRoot}/bin/dist/./snippets`],
	buildScript: `${nativescriptAngularRoot}/build-doc-snippets.sh`
}, {
	basePath: path.normalize(sdkExamplesRoot),
	distPaths: [`${sdkExamplesRoot}/dist/./code-samples`],
	buildScript: `${sdkExamplesRoot}/build-docs.sh`
}];

var silentSyncFolders = [`${modulesRoot}/bin/dist/./api-reference`, `${sidekickRoot}/./sidekick`, `${root}/bin/./angular`, `${root}/bin/nativescript/./`];

var listeners = [{
	workDir: `${root}/bin`,
	cmd: "jekyll build --config _config_nativescript.yml,_config.yml --watch --incremental",
	env: { JEKYLL_ENV: "nativescript" }
}, {
	workDir: `${root}/bin`,
	cmd: "jekyll build --config _config_angular.yml,_config.yml --watch --incremental",
	env: { JEKYLL_ENV: "angular" }
}, {
	workDir: sidekickRoot,
	cmd: "jekyll build --config _config.yml --watch --incremental"
}];

listeners.forEach(l => {
	console.log(`Starting listener in ${l.workDir}: ${l.cmd}`);
	var opts = { cwd: l.workDir };
	if (l.env) {
		var env = process.env;
		for (var key in l.env) {
			env[key] = l.env[key];
		}
		opts.env = env;
	}

	exec(l.cmd, opts, (error, stdout, stderr) => {
		if (error) {
			console.log(`Failed to start listener: ${l.cmd} - ${error}`);
		}
	});
});

setInterval(() => {
	if (!watching || !syncing) {
		return;
	}

	if (silentSyncFolders.length > 0) {
		var sources = silentSyncFolders.join(" ");
		syncing = false;
		let rsyncScript = `rsync --relative --delete -avzP ${sources} ${distRoot}`;
		execScript(rsyncScript, false, () => syncing = true);
	}
}, 2000);

var watchPaths = sourcePaths.map(x => x.basePath);
var distPaths = sourcePaths.filter(x => (x.distPaths || []).length > 0).map(x => x.distPaths);
var ignoredPaths = [].concat.apply([], distPaths);
ignoredPaths.push("**/node_modules/**", "**/*.tar.gz");
console.log(`Watch paths: ${watchPaths}`);

var chokidarOptions = {
	persistent: true,
	ignoreInitial: true,
	ignored: ignoredPaths,
	usePolling: true,
	interval: 1000
};
var watcher = chokidar.watch(watchPaths, chokidarOptions);

watcher
	.on("add", changed)
	.on("change", changed)
	.on("unlink", removed)
	.on("error", function(error) { console.error("Error", error); });

function changed(p) {
	if (!watching) {
		return;
	}

	var destFile = getDestFile(p);
	if (!destFile) {
		return;
	}

	var folder = path.dirname(destFile);

	if (!fs.existsSync(folder)) {
		fs.ensureDirSync(folder);
	}

	if (fs.existsSync(p)) {
		fs.copySync(p, destFile);
		console.log(`${destFile} updated`);
	}
}

function removed(p) {
	if (!watching) {
		return;
	}

	var destFile = getDestFile(p);
	if (!destFile) {
		return;
	}

	if (fs.existsSync(destFile)) {
		fs.unlinkSync(destFile);
		console.log(`${destFile} removed`);
	}
}

function getDestFile(p) {
	var sourcePath = sourcePaths.find(x => isChildOf(p, x.basePath));
	if (!sourcePath) {
		return null;
	}

	if (!sourcePath.buildScript) {
		var relativePath = path.relative(sourcePath.basePath, p);
		var destFile = path.join(contentPath, relativePath);
		return destFile;
	}

	var distPaths = sourcePath.distPaths || [];

	if (fs.existsSync(sourcePath.buildScript) && distPaths.length > 0) {
		console.log(`Triggering build script ${sourcePath.buildScript}`);
		var workDir = path.dirname(sourcePath.buildScript);
		watching = false;
		exec(sourcePath.buildScript, { cwd: workDir }, (error, stdout, stderr) => {
			watching = true;

			if (error) {
				console.log(`build script execution failed: ${error}`);
			} else {
				console.log(`Build script ${sourcePath.buildScript} successfully completed`);
			}

			distPaths.forEach(distPath => {
				var script = `rsync --relative -avzP ${distPath} ${contentPath}`;
				console.log(`Executing sync script: ${script}`);
				exec(script, (error, stdout, stderr) => {
					if (error) {
						console.log(`Sync script failed: ${error}`);
					}
				});
			});
		});
	}

	return null;
}

function isChildOf(child, parent) {
	child = path.normalize(child);
	parent = path.normalize(parent);

	if (child === parent) {
		return false;
	}

	var parentTokens = parent.split("/").filter(i => i.length);
	var childTokens = child.split("/").filter(i => i.length);
	return parentTokens.every((t, i) => childTokens[i].toLowerCase() === t.toLowerCase());
}

function execScript(script, sync, done) {
	if (sync == true) {
		try {
			execSync(script);
			if (done) {
				done();
			}
		} catch (error) {
			console.log(`Sync script failed: ${error}`);
		}
	} else {
		exec(script, (error, stdout, stderr) => {
			if (error) {
				console.log(`Sync script failed: ${error}`);
			}

			if (done) {
				done();
			}
		});
	}
}
