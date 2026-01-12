import { Editor, ReferenceCache } from "obsidian";
import { getReferenceCacheFromEditor, setLinkText, removeLinkFormatting } from "../src/MarkdownUtils";

describe("MarkdownUtils", () => {
	it("getReferenceCacheFromEditor no display text", () => {
		expect(getReferenceCacheFromEditor(createEditorWithCursor(0, 0, `[[target name]]`))).toEqual({
			link: "target name",
			original: "[[target name]]",
			displayText: undefined,
			position: {
				start: {
					line: 0,
					col: 0,
					offset: -1,
				},
				end: {
					line: 0,
					col: 15,
					offset: -1,
				},
			},
		});
	});
	it("add link alias", () => {
		const editor = createEditorWithCursor(0, 0, `[[target name]]`);
		const linkCache = getReferenceCacheFromEditor(editor);
		if (linkCache == null) throw new Error("Link cache is missing");
		setLinkText(linkCache, editor, "alias");
		expect(editor.getLine(0)).toEqual("[[target name|alias]]");
	});
	it("replace empty link alias ", () => {
		const editor = createEditorWithCursor(0, 0, `[[target name|]]`);
		const linkCache = getReferenceCacheFromEditor(editor);
		if (linkCache == null) throw new Error("Link cache is missing");
		setLinkText(linkCache, editor, "alias");
		expect(editor.getLine(0)).toEqual("[[target name|alias]]");
	});
	it("replace link alias ", () => {
		const editor = createEditorWithCursor(0, 0, `[[target name|aa]]`);
		const linkCache = getReferenceCacheFromEditor(editor);
		if (linkCache == null) throw new Error("Link cache is missing");
		setLinkText(linkCache, editor, "alias");
		expect(editor.getLine(0)).toEqual("[[target name|alias]]");
	});
	it("getReferenceCacheFromEditor link only", () => {
		const linkText = "[[target|text]]";
		const cacheLink = getReferenceCacheFromEditor(createEditorWithCursor(7, 0, `${linkText}`));
		if (!cacheLink) {
			throw new Error();
		}
		expect(linkText.substring(cacheLink.position.start.col, cacheLink?.position.end.col)).toBe(linkText);
		expect(cacheLink).toEqual({
			link: "target",
			original: "[[target|text]]",
			displayText: "text",
			position: {
				start: {
					line: 7,
					col: 0,
					offset: -1,
				},
				end: {
					line: 7,
					col: 15,
					offset: -1,
				},
			},
		} as ReferenceCache);
	});
	const linkText = "[[target|text]]";
	const line = `something before ${linkText} and after`;
	const startOff = line.indexOf(linkText);
	const endOff = startOff + linkText.length;
	let o = 0;
	while (o <= line.length) {
		const off = o;
		if (off >= startOff && off < endOff) {
			it(`getReferenceCacheFromEditor off=${off} returns value`, () => {
				const cacheLink = getReferenceCacheFromEditor(createEditorWithCursor(7, off, line));
				if (!cacheLink) {
					throw new Error();
				}
				// expect(linkText.substring(cacheLink.position.start.col, cacheLink?.position.end.col)).toBe(linkText);
				expect(cacheLink).toEqual({
					link: "target",
					original: "[[target|text]]",
					displayText: "text",
					position: {
						start: {
							line: 7,
							col: startOff,
							offset: -1,
						},
						end: {
							line: 7,
							col: endOff,
							offset: -1,
						},
					},
				} as ReferenceCache);
			});
		} else {
			it(`getReferenceCacheFromEditor off=${off} returns undefined`, () => {
				const cacheLink = getReferenceCacheFromEditor(createEditorWithCursor(7, off, line));
				expect(cacheLink).toBeUndefined();
			});
		}
		o++;
	}

	// Tests for removeLinkFormatting
	it("remove wiki link with display text", () => {
		const editor = createEditorWithCursor(0, 5, `[[target|display]]`);
		const linkCache = getReferenceCacheFromEditor(editor);
		if (linkCache == null) throw new Error("Link cache is missing");
		const preservedText = removeLinkFormatting(linkCache, editor);
		expect(editor.getLine(0)).toEqual("display");
		expect(preservedText).toEqual("display");
	});

	it("remove wiki link without display text", () => {
		const editor = createEditorWithCursor(0, 5, `[[target]]`);
		const linkCache = getReferenceCacheFromEditor(editor);
		if (linkCache == null) throw new Error("Link cache is missing");
		const preservedText = removeLinkFormatting(linkCache, editor);
		expect(editor.getLine(0)).toEqual("target");
		expect(preservedText).toEqual("target");
	});

	it("remove markdown link", () => {
		const editor = createEditorWithCursor(0, 5, `[display text](target.md)`);
		const linkCache = getReferenceCacheFromEditor(editor);
		if (linkCache == null) throw new Error("Link cache is missing");
		const preservedText = removeLinkFormatting(linkCache, editor);
		expect(editor.getLine(0)).toEqual("display text");
		expect(preservedText).toEqual("display text");
	});

	it("remove link preserving surrounding text", () => {
		const editor = createEditorWithCursor(0, 15, `some text [[target|display]] more text`);
		const linkCache = getReferenceCacheFromEditor(editor);
		if (linkCache == null) throw new Error("Link cache is missing");
		const preservedText = removeLinkFormatting(linkCache, editor);
		expect(editor.getLine(0)).toEqual("some text display more text");
		expect(preservedText).toEqual("display");
	});

	it("remove wiki link with empty display text", () => {
		const editor = createEditorWithCursor(0, 5, `[[target|]]`);
		const linkCache = getReferenceCacheFromEditor(editor);
		if (linkCache == null) throw new Error("Link cache is missing");
		const preservedText = removeLinkFormatting(linkCache, editor);
		expect(editor.getLine(0)).toEqual("target");
		expect(preservedText).toEqual("target");
	});

	it("remove markdown link with surrounding text", () => {
		const editor = createEditorWithCursor(0, 15, `prefix [text](link.md) suffix`);
		const linkCache = getReferenceCacheFromEditor(editor);
		if (linkCache == null) throw new Error("Link cache is missing");
		const preservedText = removeLinkFormatting(linkCache, editor);
		expect(editor.getLine(0)).toEqual("prefix text suffix");
		expect(preservedText).toEqual("text");
	});
});

function createEditorWithCursor(line: number, ch: number, lineText: string): Editor {
	const ed: Partial<Editor> = {
		getCursor() {
			return {
				line,
				ch,
			};
		},
		getLine(line2?: number) {
			if (line2 !== line) {
				throw new Error("Unexpected getLine call");
			}
			return lineText;
		},
		replaceRange: (replacement, from, to) => {
			if (from.line != line || to?.line != line) {
				throw new Error("Unexpected line call");
			}
			lineText = lineText.substring(0, from.ch) + replacement + lineText.substring(to.ch);
		},
	};
	return ed as Editor;
}
