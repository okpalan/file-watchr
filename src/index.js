const fs = require('fs');
const EventEmitter = require('events');
const { Readable } = require('stream');

// Function to create a new instance of LogWatchr
function createFileWatchr(filePaths, options = {}) {
    const { initialInterval = 1000, minInterval = 500, maxInterval = 5000 } = options;
    
    // Private state
    const watchers = new Map();
    const lastSizes = new Map();
    const lastMTimes = new Map();
    const activityCounts = new Map();
    const fileExists = new Map();

    // Extend EventEmitter
    const logWatchr = new EventEmitter();

    // Method to start watching files
    logWatchr.start = () => {
        filePaths.forEach(filePath => {
            startWatching(filePath);
            poll(filePath);
        });
    };

    // Method to stop watching files
    logWatchr.stop = () => {
        watchers.forEach((watcher, filePath) => {
            watcher.close();
        });
        logWatchr.removeAllListeners();
    };

    // Private method to start watching a file
    function startWatching(filePath) {
        const watcher = fs.watch(filePath, (eventType, filename) => {
            if (eventType === 'rename') {
                fs.access(filePath, fs.constants.F_OK, (err) => {
                    if (err) {
                        if (fileExists.get(filePath)) {
                            fileExists.set(filePath, false);
                            console.log(`File ${filePath} deleted or renamed.`);
                            logWatchr.emit(`${filePath}:delete`);
                        }
                    } else {
                        if (!fileExists.get(filePath)) {
                            fileExists.set(filePath, true);
                            console.log(`File ${filePath} created or renamed back.`);
                            logWatchr.emit(`${filePath}:create`);
                        }
                    }
                });
            }
        });

        watchers.set(filePath, watcher);
        fileExists.set(filePath, false);
        activityCounts.set(filePath, 0);
    }

    // Private method to adjust polling interval
    function adjustInterval(filePath) {
        if (activityCounts.get(filePath) > 5) {
            logWatchr.pollingInterval = Math.max(minInterval, logWatchr.pollingInterval / 2);
            console.log(`High activity detected for ${filePath}. Reducing polling interval to ${logWatchr.pollingInterval}ms.`);
        } else {
            logWatchr.pollingInterval = Math.min(maxInterval, logWatchr.pollingInterval * 2);
            console.log(`Low activity detected for ${filePath}. Increasing polling interval to ${logWatchr.pollingInterval}ms.`);
        }
        activityCounts.set(filePath, 0); // Reset activity count after adjusting
    }

    // Private method to poll a file
    function poll(filePath) {
        fs.stat(filePath, (err, stats) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    if (fileExists.get(filePath)) {
                        fileExists.set(filePath, false);
                        console.log(`File ${filePath} deleted or renamed.`);
                        logWatchr.emit(`${filePath}:delete`);
                    }
                } else {
                    logWatchr.emit(`${filePath}:error`, err);
                }
                return;
            }

            if (!fileExists.get(filePath)) {
                fileExists.set(filePath, true);
                lastSizes.set(filePath, stats.size); // Initialize last size to current size on file creation
                lastMTimes.set(filePath, stats.mtime.getTime()); // Initialize last modified time
                console.log(`File ${filePath} created or renamed back.`);
                logWatchr.emit(`${filePath}:create`);
            }

            const currentSize = stats.size;
            const currentMTime = stats.mtime.getTime();

            if (currentMTime !== lastMTimes.get(filePath)) {
                activityCounts.set(filePath, activityCounts.get(filePath) + 1);
                if (currentSize > lastSizes.get(filePath)) {
                    console.log(`File ${filePath} written. Size: ${currentSize}, Modified Time: ${new Date(currentMTime)}`);
                    readNewContent(filePath, 'write', currentSize);
                } else if (currentSize < lastSizes.get(filePath)) {
                    console.log(`File ${filePath} truncated. Size: ${currentSize}, Modified Time: ${new Date(currentMTime)}`);
                    logWatchr.emit(`${filePath}:truncate`, { size: currentSize, mtime: currentMTime });
                } else {
                    console.log(`File ${filePath} appended. Size: ${currentSize}, Modified Time: ${new Date(currentMTime)}`);
                    readNewContent(filePath, 'append', currentSize);
                }

                lastSizes.set(filePath, currentSize);
                lastMTimes.set(filePath, currentMTime);
            }

            // Adjust the polling interval based on activity
            adjustInterval(filePath);

            setTimeout(() => poll(filePath), logWatchr.pollingInterval);
        });
    }

    // Private method to read new content from a file
    function readNewContent(filePath, eventType, currentSize) {
        const fileStream = fs.createReadStream(filePath, {
            start: lastSizes.get(filePath),
            end: currentSize - 1,
            encoding: 'utf-8'
        });

        const gulpStream = new Readable({
            read() {}
        });

        fileStream.on('data', chunk => {
            gulpStream.push(chunk);
        });

        fileStream.on('end', () => {
            gulpStream.push(null); // No more data to push
        });

        fileStream.on('error', err => {
            gulpStream.emit('error', err);
        });

        logWatchr.emit(`${filePath}:${eventType}`, gulpStream);

        gulpStream.on('error', err => {
            console.error(`Error reading new content for file ${filePath}:`, err);
            logWatchr.emit(`${filePath}:error`, err);
        });

        gulpStream.on('end', () => {
            console.log(`File ${filePath} ${eventType} stream ended.`);
        });

        gulpStream.on('close', () => {
            console.log(`File ${filePath} ${eventType} stream closed.`);
        });
    }

    // Public properties
    logWatchr.pollingInterval = initialInterval;

    // Return the LogWatchr instance
    return logWatchr;
}

module.exports = createFileWatchr;

