const fs = require('fs');
const path = require('path');
const createFileWatchr = require('./index');
const { expect } = require('chai');

// Test suite for File Watcher
describe('File Watcher', () => {
    const logFiles = [path.resolve(process.cwd(),'test.log')]
    let logWatchr;

    before(() => {
        // Create LogWatchr instance before running tests
        const filePaths = logFiles.map(file => path.join(__dirname, 'logs', file));
        logWatchr = createFileWatchr(filePaths, { initialInterval: 100, minInterval: 50, maxInterval: 200 });
        logWatchr.start();
    });

    after(() => {
        // Stop LogWatchr instance after tests complete
        logWatchr.stop();
    });

    it('should emit "create" event when a new file is created', (done) => {
        logWatchr.once(`${logFiles[0]}:create`, () => {
            done();
        });

        // Simulate creating a new file
        fs.writeFileSync(path.join(__dirname, 'logs', 'test.log'), 'Initial content');
    });

    it('should emit "write" event when a file is written to', (done) => {
        logWatchr.once(`${logFiles[0]}:write`, (stream) => {
            let content = '';
            stream.on('data', chunk => {
                content += chunk.toString();
            });

            stream.on('end', () => {
                expect(content).to.equal('New content');
                done();
            });
        });

        // Simulate writing to an existing file
        fs.appendFileSync(path.join(__dirname, 'logs', 'test.log'), '\nNew content');
    });

    it('should emit "truncate" event when a file is truncated', (done) => {
        logWatchr.once(`${logFiles[0]}:truncate`, (info) => {
            expect(info.size).to.equal(0); // Check if size is reset after truncation
            done();
        });

        // Simulate truncating an existing file
        fs.writeFileSync(path.join(__dirname, 'logs', 'test.log'), ''); // Truncate by emptying the file
    });

    it('should emit "delete" event when a file is deleted', (done) => {
        logWatchr.once(`${logFiles[0]}:delete`, () => {
            done();
        });

        // Simulate deleting an existing file
        fs.unlinkSync(path.join(__dirname, 'logs', 'test.log'));
    });

    it('should handle errors gracefully', (done) => {
        logWatchr.once(`${logFiles[0]}:error`, (err) => {
            expect(err).to.exist;
            done();
        });

        // Simulate an error scenario (e.g., accessing a non-existent file)
        fs.stat(path.join(__dirname, 'logs', 'nonexistent.log'), (err) => {
            if (err) {
                console.error('Error occurred:', err);
            }
        });
    });

    // Additional test case for append event
    it('should emit "append" event when a file is appended to', (done) => {
        logWatchr.once(`${logFiles[0]}:append`, (stream) => {
            let content = '';
            stream.on('data', chunk => {
                content += chunk.toString();
            });

            stream.on('end', () => {
                expect(content).to.equal('Appended content');
                done();
            });
        });

        // Simulate appending to an existing file
        fs.appendFileSync(path.join(__dirname, 'logs', 'test.log'), 'Appended content');
        
    });


});


