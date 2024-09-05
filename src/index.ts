import FileSaver from 'file-saver';
import type { Editor, Plugin } from 'grapesjs';
import JSZip from 'jszip';

export type RootType = Record<string, unknown>;

export type PluginOptions = {
  /**
   * Add a button inside the export dialog
   * @default true
   */
  addExportBtn?: boolean,

  /**
   * Label of the export button
   * @default 'Export to ZIP'
   */
  btnLabel?: string

  /**
   * ZIP filename prefix
   * @default 'grapesjs_template'
   */
  filenamePfx?: string

  /**
   * Use a function to generate the filename, eg. `filename: editor => 'my-file.zip',`
   */
   filename?: (editor: Editor) => string,

   /**
    * Callback to execute once the export is completed
    */
   done?: () => void,

   /**
    * Callback to execute on export error
    */
   onError?: (error: Error) => void,

   /**
    * Use the root object to create the folder structure of your zip (async functions are supported)
    * @example
    * root: {
    *   css: {
    *     'style.css': ed => ed.getCss(),
    *     'some-file.txt': 'My custom content',
    *   },
    *   img: async ed => {
    *     const images = await fetchImagesByStructue(ed.getComponents());
    *     return images;
    *     // Where `images` is an object like this:
    *     // { 'img1.png': '...png content', 'img2.jpg': '...jpg content' }
    *   },
    *   'index.html': ed => `<body>${ed.getHtml()}</body>`
    * }
    */
   root?: RootType | ((editor: Editor) => Promise<RootType>),

   /**
    * Custom function for checking if the file content is binary
    */
   isBinary?: (content: string, name: string) => boolean,
};
/**
 * @TODO canvasScripts and canvasStyles need to convert in a way so libraries can be taken dynamically.
 * @param editor 
 * @param opts 
 */

const plugin: Plugin<PluginOptions> = (editor, opts = {}) => {
  const pfx = editor.getConfig('stylePrefix');
  const commandName = 'gjs-export-zip';
  const canvasScripts = (): string => {  
   
        let scripts = new Array( "https://code.jquery.com/jquery-3.3.1.slim.min.js",
              "https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.14.3/umd/popper.min.js",
              "https://stackpath.bootstrapcdn.com/bootstrap/4.1.3/js/bootstrap.min.js" );
        let scriptTags = '';
        scripts.forEach((url: string) => {
          scriptTags += `<script src="${url}"></script>\n`;
        });
        return scriptTags.trim();
        
  };
  const canvasStyles = (): string => {
      let styles = new Array( "https://stackpath.bootstrapcdn.com/bootstrap/4.1.3/css/bootstrap.min.css"); 
      let linkTags = '';
      styles.forEach((url: string) => {
        linkTags += `<link rel="stylesheet" href="${url}">\n`;
      });
      return linkTags.trim();
      
  };
  const config: PluginOptions = {
    addExportBtn: true,
    btnLabel: 'Export',
    filenamePfx: 'lb_template',
    filename: undefined,
    done: () => {},
    onError: console.error,
    root: {
      css: {
        'style.css': (editor: Editor) => editor.getCss(),
      },
      'index.html': (editor: Editor) =>
        `<!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
             ${canvasStyles()}
            <link rel="stylesheet" href="./css/style.css">
          </head>
          ${editor.getHtml()} 

          ${canvasScripts()}
        </html>`,
    },
    isBinary: undefined,
    ...opts,
  };


  // Add command
  editor.Commands.add(commandName, {

    run(editor, s, opts: PluginOptions = {}) {
      const zip = new JSZip();
      const onError = opts.onError || config.onError;
      const root = opts.root || config.root;

      this.createDirectory(zip, root)
        .then(async () => {
          const content = await zip.generateAsync({ type: 'blob' });
          const filenameFn = opts.filename || config.filename;
          const done = opts.done || config.done;
          const filenamePfx = opts.filenamePfx || config.filenamePfx;
          const filename = filenameFn ? filenameFn(editor) : `${filenamePfx}_${Date.now()}.zip`;
          FileSaver.saveAs(content, filename);
          done?.();
        })
        .catch(onError);
    },

    createFile(zip: JSZip, name: string, content: string) {
      const opts: JSZip.JSZipFileOptions = {};
      const ext = name.split('.')[1];
      const isBinary = config.isBinary ?
        config.isBinary(content, name) :
        !(ext && ['html', 'css'].indexOf(ext) >= 0) &&
        !/^[\x00-\x7F]*$/.test(content);

      if (isBinary) {
        opts.binary = true;
      }

      editor.log('Create file', { ns: 'plugin-export',
        // @ts-ignore
        name, content, opts
      });
      zip.file(name, content, opts);
    },

    async createDirectory(zip: JSZip, root: PluginOptions["root"]) {
      root = typeof root === 'function' ? await root(editor) : root;

      for (const name in root) {
        if (root.hasOwnProperty(name)) {
          let content = root[name];
          content = typeof content === 'function' ? await content(editor) : content;
          const typeOf = typeof content;

          if (typeOf === 'string') {
            this.createFile(zip, name, content as string);
          } else if (typeOf === 'object') {
            const dirRoot = zip.folder(name)!;
            await this.createDirectory(dirRoot, content as RootType);
          }
        }
      }
    },
  });

  editor.onReady(() => {
    // Add button inside export dialog
    if (config.addExportBtn) {
      const btnExp = document.createElement('button');
      btnExp.innerHTML = config.btnLabel!;
      btnExp.className = `${pfx}btn-prim`;
      btnExp.type = 'button';

      editor.on('run:export-template', () => {
        const el = editor.Modal.getContentEl();
        el?.appendChild(btnExp);
        btnExp.onclick = () => editor.runCommand(commandName);
      });
    }
  })
};

export default plugin;
