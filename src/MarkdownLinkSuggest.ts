import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, prepareFuzzySearch, TFile } from "obsidian";

/**
 * Custom autocomplete for markdown links.
 * Provides file suggestions when typing inside markdown link parentheses: [text](|)
 */
export class MarkdownLinkSuggest extends EditorSuggest<TFile> {
	private app: App;

	constructor(app: App) {
		super(app);
		this.app = app;
	}

	/**
	 * Detect when cursor is inside markdown link parentheses and trigger suggestions.
	 * Called on every keypress - must be fast!
	 */
	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
		// Get current line
		const line = editor.getLine(cursor.line);

		// Quick check: must have opening paren before cursor
		const beforeCursor = line.substring(0, cursor.ch);
		if (!beforeCursor.contains('](')) {
			return null;
		}

		// Find the markdown link pattern around cursor
		// Look backwards for `](`
		let linkStartIdx = -1;
		for (let i = cursor.ch - 1; i >= 0; i--) {
			if (line.charAt(i) === '(' && i > 0 && line.charAt(i - 1) === ']') {
				linkStartIdx = i + 1;
				break;
			}
		}

		if (linkStartIdx === -1) {
			return null;
		}

		// Find the closing paren after cursor
		let linkEndIdx = line.indexOf(')', cursor.ch);
		if (linkEndIdx === -1) {
			return null;
		}

		// Verify cursor is between ( and )
		if (cursor.ch < linkStartIdx || cursor.ch > linkEndIdx) {
			return null;
		}

		// Verify this is actually part of a markdown link by finding the opening [
		let textStartIdx = -1;
		for (let i = linkStartIdx - 3; i >= 0; i--) {
			if (line.charAt(i) === '[') {
				textStartIdx = i;
				break;
			}
			// Stop if we hit another link delimiter
			if (line.charAt(i) === ']' || line.charAt(i) === '(' || line.charAt(i) === ')') {
				return null;
			}
		}

		if (textStartIdx === -1) {
			return null;
		}

		// Extract the query (text between opening paren and cursor)
		const query = line.substring(linkStartIdx, cursor.ch);

		return {
			start: {
				line: cursor.line,
				ch: linkStartIdx,
			},
			end: {
				line: cursor.line,
				ch: linkEndIdx,
			},
			query: query,
		};
	}

	/**
	 * Search vault for files matching the query using Obsidian's fuzzy matching.
	 * Returns files sorted by relevance.
	 */
	getSuggestions(context: EditorSuggestContext): TFile[] {
		const query = context.query;
		const allFiles = this.app.vault.getMarkdownFiles();

		if (query.length === 0) {
			// No query - return all files (limit to 50 for performance)
			return allFiles.slice(0, 50);
		}

		// Use Obsidian's built-in fuzzy search
		const fuzzy = prepareFuzzySearch(query);

		// Filter and rank files using fuzzy matching
		const matches: Array<{ file: TFile; score: number }> = [];

		for (const file of allFiles) {
			let bestScore = -Infinity;

			// Match against filename (highest priority)
			const fileNameResult = fuzzy(file.basename);
			if (fileNameResult) {
				bestScore = fileNameResult.score;
			}

			// Match against full path (lower priority)
			const pathResult = fuzzy(file.path);
			if (pathResult) {
				// Path matches score lower than filename matches
				bestScore = Math.max(bestScore, pathResult.score - 10);
			}

			// Match against aliases
			const aliases = this.getFileAliases(file);
			for (const alias of aliases) {
				const aliasResult = fuzzy(alias);
				if (aliasResult) {
					// Alias matches score slightly lower than filename
					bestScore = Math.max(bestScore, aliasResult.score - 1);
				}
			}

			if (bestScore > -Infinity) {
				matches.push({ file, score: bestScore });
			}
		}

		// Sort by score (highest first)
		matches.sort((a, b) => b.score - a.score);

		// Return top 20 matches
		return matches.slice(0, 20).map(m => m.file);
	}

	/**
	 * Render each suggestion item.
	 * Display the full path to help users distinguish between files with the same name.
	 */
	renderSuggestion(file: TFile, el: HTMLElement): void {
		// Clear the element
		el.empty();

		// Create suggestion content
		const content = el.createDiv({ cls: "suggestion-content" });
		const title = content.createDiv({ cls: "suggestion-title" });
		title.setText(file.basename);

		// Show full path as auxiliary info
		if (file.path !== file.basename + ".md") {
			const aux = content.createDiv({ cls: "suggestion-note" });
			aux.setText(file.path);
		}

		// Show aliases if they exist
		const aliases = this.getFileAliases(file);
		if (aliases.length > 0) {
			const aliasEl = content.createDiv({ cls: "suggestion-note" });
			aliasEl.setText(`Aliases: ${aliases.join(", ")}`);
		}
	}

	/**
	 * Handle user selection.
	 * Generate a properly formatted markdown link using Obsidian's API.
	 */
	selectSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent): void {
		if (!this.context) return;

		const editor = this.context.editor;
		const line = editor.getLine(this.context.start.line);

		// Extract the display text from [text]()
		const textStartIdx = line.lastIndexOf('[', this.context.start.ch - 2);
		const textEndIdx = line.indexOf(']', textStartIdx);
		const displayText = line.substring(textStartIdx + 1, textEndIdx);

		// Get current file path for relative link calculation
		const activeFile = this.app.workspace.getActiveFile();
		const sourcePath = activeFile?.path ?? '';

		// Generate proper markdown link with encoding
		const markdownLink = this.app.fileManager.generateMarkdownLink(
			file,
			sourcePath,
			undefined,
			displayText || undefined
		);

		// Replace the entire [text]() structure
		const fullLinkStart = { line: this.context.start.line, ch: textStartIdx };
		const fullLinkEnd = { line: this.context.end.line, ch: this.context.end.ch + 1 };

		editor.replaceRange(markdownLink, fullLinkStart, fullLinkEnd);

		// Position cursor after the link
		const newCursorPos = {
			line: this.context.start.line,
			ch: textStartIdx + markdownLink.length,
		};
		editor.setCursor(newCursorPos);
	}

	/**
	 * Get aliases for a file from its frontmatter.
	 */
	private getFileAliases(file: TFile): string[] {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache || !cache.frontmatter) {
			return [];
		}

		const aliases = cache.frontmatter['aliases'];
		if (!aliases) {
			return [];
		}

		// Aliases can be a string or array
		if (typeof aliases === 'string') {
			return [aliases];
		} else if (Array.isArray(aliases)) {
			return aliases.filter(a => typeof a === 'string');
		}

		return [];
	}
}
