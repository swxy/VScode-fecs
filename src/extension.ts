'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
// 使用node子进程来运行fecs命令
import * as child_process from 'child_process';
import * as path from 'path';
import {GitDiffParser} from './diff';
const fecs = require('fecs');
// fecs 检测结果表示
interface fecsErrorModel {
    line: number,
    column: number,
    severity: number,
    message: string,
    rule: string,
    info: string
}

interface fecsCheckResult {
    path: string;
    relative: string;
    errors: fecsErrorModel[]
}

interface fecsOptions {
    _: string[],
    stream: boolean,
    reporter?: string,
    format?: string,
    silent: boolean,
    level?: number | undefined
}
// const child_process = require('child_process');
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "fecs" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('extension.fecs', () => {
        // let fileType = vscode.window.activeTextEditor.document.languageId;
        if(vscode.window.activeTextEditor) {
            const fileName = vscode.window.activeTextEditor.document.fileName;
            let fileType: string;
            let matchArry: Array<any> | null;
            if (fileName) {
                matchArry = fileName.match(/.*\.(.*)$/);
                if (matchArry !== null) {
                    fileType = matchArry[1].toLowerCase();
                }
                else {
                    deactivate();
                    return false;
                }
            }
            else {
                deactivate();
                return false;
            }
            // const fileType = vscode.window.activeTextEditor.document.languageId;
            if (
                fileType === 'js'
                || fileType === 'es' 
                || fileType === 'html' 
                || fileType === 'css' 
                || fileType === 'less'
                || fileType === 'jsx'
                || fileType === 'vue'
            ) {
                
                let options:fecsOptions = {
                    _: [fileName],
                    stream: false,
                    silent: false
                };

                // display output in English if 'fecs.en' is true
                const ifEnglish = vscode.workspace.getConfiguration('fecs').get('en');
                if (ifEnglish) {
                }
                else {
                    options.reporter = 'baidu';
                }
                const level = vscode.workspace.getConfiguration('fecs').get('level');
                options.level = Number(level);

                // 标识是否输出文件的全部检测结果，一般是git仓库的话，推荐设置为false
                const all = vscode.workspace.getConfiguration('fecs').get('all');
                if (!all) {
                    options.format = 'json';
                }
                
                showOutput(options);
                return;
            }
            else {
                deactivate();
                return false;
            }
        }
        return;
        // Display a message box to the user
        // vscode.window.showInformationMessage('Hello World!');
    });

    context.subscriptions.push(disposable);
}
// 新建output
const output = vscode.window.createOutputChannel('fecs output');
/**
 * 将命令执行结果显示在output中
 *
 * @param options 命令参数
 */
function showOutput(options: fecsOptions) {
    // 先清空output
    output.clear();
    fecs.check(options, (success:boolean, errors:fecsCheckResult[]) => {
        console.log('checked result', success);
        let data;
        let lines:number[] = [];
        const isCheckAll = options.format !== 'json';
        if (!isCheckAll) {
            lines = diff(options._[0]);
        }
        if (!isCheckAll && !lines.length) {
            data = '[fecs]表示没有发现啥问题!';
        }
        else {
            data = filterError(errors, lines, isCheckAll);
        }
        // vscode.workspace.saveAll();
        output.append(data);
        output.show(5, true);
    })
    return;
}

/**
 * 如何设置all为false的话， 过滤其他未改动项的检测结果
 * 
 * @param result 检测结果
 * @param lines 文件有变动的行数
 */
function filterError(fecsJsonDatas: fecsCheckResult[], lines: number[], isCheckAll: boolean): string {
    const errors: string[] = [];
    const num2str = ['', ' WARN', 'ERROR'];
    fecsJsonDatas.forEach(fecsJsonData => {
        fecsJsonData.errors.forEach(error => {
            const {line, info, severity} = error;
            if (isCheckAll || ~lines.indexOf(line)) { // ==> lines.indexOf(x) !== -1
                const tip: string = num2str[severity];
                errors.push(`${tip} ${info}`);
            }
        });
    });
    return errors.join('\n');
}

/**
 * 使用git检测文件差异
 * 
 * @param filePath 文件路径，此时是一个绝对路径
 */
function diff(filePath: string): number[] {
    const rootPath = vscode.workspace.rootPath || '';
    const fileRelativeName = path.relative(rootPath, filePath);
    const data = child_process.spawnSync('git', [`diff`, `--diff-filter=M`, `-M`, `--no-ext-diff`, fileRelativeName], {cwd: rootPath});
    const outputData = data.stdout.toString();
    if (!outputData) {
        return [];
    }
    const diffData = GitDiffParser.parse(outputData, true);
    const lines = GitDiffParser.concatLine(diffData!.chunks);
    return lines;
}

// automatically use fecs on did save file if 'extension.fecs' is true
vscode.workspace.onDidSaveTextDocument(() => {
    const ifAutoFecs = vscode.workspace.getConfiguration('fecs').get('auto');
    if (ifAutoFecs) {
        vscode.commands.executeCommand('extension.fecs');
        return;
    }
    else {
        return false;
    }
})
// this method is called when your extension is deactivated
export function deactivate() {
    output.clear();
    output.hide();
}