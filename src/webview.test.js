const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

describe('Webview HTML Structure', () => {
    let document;

    beforeAll(() => {
        // Load the HTML file
        const htmlFilePath = path.join(__dirname, 'webview.html');
        const htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
        const dom = new JSDOM(htmlContent);
        document = dom.window.document;
    });

    test('should have tree view / list view toggle icon', () => {
        const toggleButton = document.getElementById('viewToggleButton');
        expect(toggleButton).toBeTruthy();
        expect(toggleButton.title).toBe('Toggle Tree/List View');
    });

    test('should have repo selection dropdown', () => {
        const repoSelect = document.getElementById('repoSelect');
        expect(repoSelect).toBeTruthy();
    });

    test('should have branch selection dropdown', () => {
        const branchSelect = document.getElementById('branchSelect');
        expect(branchSelect).toBeTruthy();
    });

    test('should have Project Tasks container', () => {
        const projectTasksHeader = document.getElementById('projectTasksHeader');
        expect(projectTasksHeader).toBeTruthy();
        const projectTasksContent = document.getElementById('projectTasksContent');
        expect(projectTasksContent).toBeTruthy();
    });

    test('should have Git container with Changes, Staged Changes, and Merge Conflicts', () => {
        const gitContainer = document.getElementById('gitContainer');
        expect(gitContainer).toBeTruthy();

        const changesHeader = document.getElementById('changesHeader');
        expect(changesHeader).toBeTruthy();
        const stagedHeader = document.getElementById('stagedHeader');
        expect(stagedHeader).toBeTruthy();
        const mergeConflictsHeader = document.getElementById('mergeConflictsHeader');
        expect(mergeConflictsHeader).toBeTruthy();
    });

    test('should have Commit message input and git operation result message popup', () => {
        // Assuming you have a commit message input and a result message popup
        const commitMessageInput = document.getElementById('commitMessageInput'); // Adjust ID as necessary
        expect(commitMessageInput).toBeTruthy();

        const gitOperationResultPopup = document.getElementById('gitOperationResultPopup'); // Adjust ID as necessary
        expect(gitOperationResultPopup).toBeTruthy();
    });

    test('should have TODO container', () => {
        const todoHeader = document.getElementById('todoHeader');
        expect(todoHeader).toBeTruthy();
        const todoContent = document.getElementById('todoContent');
        expect(todoContent).toBeTruthy();
    });
}); 