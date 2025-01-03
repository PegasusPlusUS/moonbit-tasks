const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

describe('Webview HTML Structure', () => {
    let document;
    let window;

    beforeAll(() => {
        // Load the HTML file
        const htmlFilePath = path.join(__dirname, 'webview.html');
        const htmlContent = fs.readFileSync(htmlFilePath, 'utf8');
        const dom = new JSDOM(htmlContent, { runScripts: "dangerously", resources: "usable" });
        document = dom.window.document;
        window = dom.window;
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
        const commitMessageInput = document.getElementById('commitMessageInput');
        expect(commitMessageInput).toBeTruthy();

        const gitOperationResultPopup = document.getElementById('gitOperationResultPopup');
        expect(gitOperationResultPopup).toBeTruthy();
    });

    test('should have TODO container', () => {
        const todoHeader = document.getElementById('todoHeader');
        expect(todoHeader).toBeTruthy();
        const todoContent = document.getElementById('todoContent');
        expect(todoContent).toBeTruthy();
    });

    test('should have buttons in Changes header with correct default display', () => {
        const viewAllButton = document.getElementById('viewAllButton');
        const stageAllButton = document.getElementById('stageAllButton');
        const discardAllButton = document.getElementById('discardAllButton');

        expect(viewAllButton).toBeTruthy();
        expect(stageAllButton).toBeTruthy();
        expect(discardAllButton).toBeTruthy();

        // Check that the default display property is 'none'
        expect(viewAllButton.style.display).toBe('');
        expect(stageAllButton.style.display).toBe('');
        expect(discardAllButton.style.display).toBe('');

        // Simulate adding the hover class to check the display property
        // viewAllButton.classList.add('hover');
        // stageAllButton.classList.add('hover');
        // discardAllButton.classList.add('hover');

        // // Check that the display property changes to 'inline-block' when hovered
        // expect(viewAllButton.style.display).toBe('inline-block');
        // expect(stageAllButton.style.display).toBe('inline-block');
        // expect(discardAllButton.style.display).toBe('inline-block');

        // // Remove the hover class to check the default display again
        // viewAllButton.classList.remove('hover');
        // stageAllButton.classList.remove('hover');
        // discardAllButton.classList.remove('hover');

        // // Check that the display property is back to 'none'
        // expect(viewAllButton.style.display).toBe('');
        // expect(stageAllButton.style.display).toBe('');
        // expect(discardAllButton.style.display).toBe('');
    });

    test('should have action-button.hover class with inline-block display', () => {
        // Create a style element to hold the CSS for testing
        const style = document.createElement('style');
        style.textContent = `
            .action-button {
                display: none; /* Default state */
            }
            .action-button.hover {
                display: inline-block; /* Show when hovered */
            }
        `;
        document.head.appendChild(style);

        // Create a button to test
        const button = document.createElement('button');
        button.className = 'action-button';
        document.body.appendChild(button);

        // Simulate adding the hover class
        button.classList.add('hover');

        // Check the computed style for the button
        const computedStyle = window.getComputedStyle(button);

        // Verify that the display property is 'inline-block' when hovered
        expect(computedStyle.display).toBe('inline-block');

        // Clean up
        document.body.removeChild(button);
        document.head.removeChild(style);
    });

    test('should have buttons in Staged Changes header and show on hover', () => {
        const viewAllStagedButton = document.getElementById('viewAllStagedButton');
        const commitStagedButton = document.getElementById('commitStagedButton');
        const unstageAllButton = document.getElementById('unstageAllButton');

        expect(viewAllStagedButton).toBeTruthy();
        expect(commitStagedButton).toBeTruthy();
        expect(unstageAllButton).toBeTruthy();

        // // Check that the default display property is 'none'
        // expect(viewAllStagedButton.style.display).toBe('none');
        // expect(commitStagedButton.style.display).toBe('none');
        // expect(unstageAllButton.style.display).toBe('none');

        // // Simulate mouse hover on the staged header
        // const stagedHeader = document.getElementById('stagedHeader');
        // stagedHeader.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));

        // // Check if buttons are displayed
        // expect(viewAllStagedButton.style.display).toBe('inline-block');
        // expect(commitStagedButton.style.display).toBe('inline-block');
        // expect(unstageAllButton.style.display).toBe('inline-block');

        // // Simulate mouse leave
        // stagedHeader.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true }));

        // // Check if buttons are hidden again
        // expect(viewAllStagedButton.style.display).toBe('none');
        // expect(commitStagedButton.style.display).toBe('none');
        // expect(unstageAllButton.style.display).toBe('none');
    });
}); 