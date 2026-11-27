/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-7e5eb42b'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "74d52c403b855a01d38e8d0aaffb463e"
  }, {
    "url": "pwa-512x512.png",
    "revision": "dadf09cf3021cc7bfa5c6ed9b16e6c1b"
  }, {
    "url": "pwa-192x192.png",
    "revision": "fc53d37e606573b811d9d132c9fb1b92"
  }, {
    "url": "index.html",
    "revision": "1863bde2f05d9a88128d6163ee70601a"
  }, {
    "url": "icon.svg",
    "revision": "b9460ebbb18f0aaa7c78883cab96d8bb"
  }, {
    "url": "favicon.png",
    "revision": "9af103e829dade859656701c057e9bba"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "51e79a7ebc2e6a6ffac60474dba7fd33"
  }, {
    "url": "assets/workbox-window.prod.es5-zd_v-k4h.js",
    "revision": null
  }, {
    "url": "assets/purify.es-DnChzBFM.js",
    "revision": null
  }, {
    "url": "assets/photoEncodeWorker-CgLhurF4.js",
    "revision": null
  }, {
    "url": "assets/jspdf.es.min-Bsb_kej4.js",
    "revision": null
  }, {
    "url": "assets/index.es-LHdkQZj3.js",
    "revision": null
  }, {
    "url": "assets/index-zQZmJNSa.css",
    "revision": null
  }, {
    "url": "assets/index-CCVsSkXh.js",
    "revision": null
  }, {
    "url": "assets/html2canvas-lvXRMrt4.js",
    "revision": null
  }, {
    "url": "assets/aistudio/image_f57fd2d7.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_ee5722ca.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_bbd1009c.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_90a963ef.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_7f3b3f3c.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_753bbbd1.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_70e4eae5.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_4daead71.png",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261126_232940_4ecb9c93.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261126_150609_8f04399b.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Logo_Mentawai_5ae4cefd.jpg",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "51e79a7ebc2e6a6ffac60474dba7fd33"
  }, {
    "url": "favicon.png",
    "revision": "9af103e829dade859656701c057e9bba"
  }, {
    "url": "icon.svg",
    "revision": "b9460ebbb18f0aaa7c78883cab96d8bb"
  }, {
    "url": "pwa-192x192.png",
    "revision": "fc53d37e606573b811d9d132c9fb1b92"
  }, {
    "url": "pwa-512x512.png",
    "revision": "dadf09cf3021cc7bfa5c6ed9b16e6c1b"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "74d52c403b855a01d38e8d0aaffb463e"
  }, {
    "url": "assets/aistudio/Logo_Mentawai_5ae4cefd.jpg",
    "revision": "82db493c5d31b79b138499b50e68d46d"
  }, {
    "url": "manifest.webmanifest",
    "revision": "a596cb60bddc432329fb5ae7bb6b0da1"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));

}));
