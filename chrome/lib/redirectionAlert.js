(function() {

	var redirectionAlertID = 0;

	var timeoutAfter = 60 * 1000; //60 seconds for the website to load
	var tagsMedia = ['object', 'media', 'video', 'audio', 'embed'];
	var tagsNoContent = ['noscript', 'noframes', 'style', 'script', 'frameset'];

	var contentTypesTxt = ['application/atom+xml', 'application/atom', 'application/javascript', 'application/json', 'application/rdf+xml', 'application/rdf', 'application/rss+xml', 'application/rss', 'application/xhtml', 'application/xhtml+xml', 'application/xml', 'application/xml-dtd', 'application/html', 'text/css', 'text/csv', 'text/html', 'text/xhtml', 'text/javascript', 'text/plain', 'text/xml', 'text/json', 'text', 'html', 'xml', 'application/x-unknown-content-type', ''];
	var contentTypesKnown = [
	'application/atom+xml', 'application/atom', 'application/javascript', 'application/json', 'application/rdf+xml', 'application/rdf', 'application/rss+xml', 'application/rss', 'application/xhtml', 'application/xhtml+xml', 'application/xml', 'application/xml-dtd', 'application/html', 'text/css', 'text/csv', 'text/html', 'text/xhtml', 'text/javascript', 'text/plain', 'text/xml', 'text/json', 'text', 'html', 'xml', '', //txt
	'application/x-bzip', 'application/x-bzip-compressed-tar', 'application/x-gzip', 'application/x-tar', 'application/x-tgz', 'application/zip', //compressed
	'application/pdf', 'application/msword', //documents
	'application/x-shockwave-flash', 'application/ogg', //multimedia
	'audio/mpeg', 'audio/x-mpegurl', 'audio/x-ms-wax', 'audio/x-ms-wma', 'audio/x-wav', //audio
	'image/gif', 'image/jpeg', 'image/png', 'image/x-xbitmap', 'image/x-xpixmap', 'image/x-xwindowdump', //image
	'video/mpeg', 'video/quicktime', 'video/x-ms-asf', 'video/x-ms-wmv', 'video/x-msvideo', //video
	'application/x-unknown-content-type', '']

	var debug = false;

	this.redirectionAlert = function() {
		function RedirectionAlert() {
			return this;
		}

		RedirectionAlert.prototype = {

			init: function() {
				this.id = String(redirectionAlertID++);
				this.cache = [];
				this.cacheRedirects = [];
				this.itemsWorking = 0;
				this.itemsDone = 0;

				this.itemsNetworking = 0;
				this.queue = []

				var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
				observerService.addObserver(this, "http-on-examine-response", false);
				observerService.addObserver(this, "http-on-examine-merged-response", false);
				observerService.addObserver(this, "http-on-examine-cached-response", false);
				observerService.addObserver(this, 'content-document-global-created', false);
				observerService.addObserver(this, 'http-on-opening-request', false);
			},
			unLoad: function() {
				var self = this;
				setTimeout(function() {
					self._unLoad();
				}, 20000);
			},
			_unLoad: function() {
				if (this.itemsWorking != this.itemsDone)
					return;

				var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
				observerService.removeObserver(this, "http-on-examine-response", false);
				observerService.removeObserver(this, "http-on-examine-merged-response", false);
				observerService.removeObserver(this, "http-on-examine-cached-response", false);
				observerService.removeObserver(this, 'content-document-global-created', false);
				observerService.removeObserver(this, 'http-on-opening-request', false);

				delete(this.cache);
				delete(this.cacheRedirects);
				delete(this.itemsWorking);
				delete(this.itemsDone);
				delete(this.queue);
			},
			observe: function(aSubject, aTopic, aData) {
				switch (aTopic) {
					case 'http-on-examine-response':
					case 'http-on-examine-merged-response':
					case 'http-on-examine-cached-response':

						aSubject.QueryInterface(Components.interfaces.nsIHttpChannel);
						// LISTEN for Tabs
						// this piece allows to get the HTTP code of urls that redirects via metarefresh or JS
						// allow to holds the urls of external content associated to a tab. !
						try {
							var notificationCallbacks = aSubject.notificationCallbacks ? aSubject.notificationCallbacks : aSubject.loadGroup.notificationCallbacks;
							if (!notificationCallbacks) {} else {
								var domWin = notificationCallbacks.getInterface(Components.interfaces.nsIDOMWindow);
								var aTab = ODPExtension.tabGetFromChromeDocument(domWin);
								if (aTab && !! aTab.ODPExtensionExternalContent) {
									aTab.ODPExtensionExternalContent[aTab.ODPExtensionExternalContent.length] = {
										url: aSubject.URI.spec,
										status: aSubject.responseStatus
									};
									aTab.ODPExtensionURIsStatus[aSubject.URI.spec] = aSubject.responseStatus;
								}
							}
						} catch (e) {}

						// LISTEN for XMLHttpRequest
						this.onExamineResponse(aSubject);
						break;
					case 'content-document-global-created':
						if (aSubject instanceof Components.interfaces.nsIDOMWindow) {
							var aTab = ODPExtension.tabGetFromChromeDocument(aSubject);
							if (aTab && !! aTab.ODPExtensionLinkChecker) {
								ODPExtension.disableTabFeatures(aSubject, aTab, this.cache[aTab.ODPExtensionOriginalURI]);
							}
						}
						break;
					case 'http-on-opening-request':
						aSubject.QueryInterface(Components.interfaces.nsIHttpChannel);
						if(ODPExtension.isGarbage(aSubject.URI.spec)){
							aSubject.cancel(Components.results.NS_BINDING_ABORTED);
						}
						break;
				}
			},
			onExamineResponse: function(oHttp) {

				//skiping the examinations of requests NOT related to our redirection alert
				if (!this.cache[oHttp.originalURI.spec]) {
					if (!this.cacheRedirects[oHttp.originalURI.spec]) {
						//this examination comes from a request (browser, extension, document) not related to the current process: checking the status of the this document/selected links
						return;
					} else {
						//resolving: from where this redirection come from - this resolve when a redirect redirect again to another place
						var originalURI = this.cacheRedirects[oHttp.originalURI.spec];
					}
				} else {
					var originalURI = oHttp.originalURI.spec;
				}
				if (this.cache[originalURI].stop == true) {
					//resolving: this item was already checked to the end but all the request are still on examination
					//so: if you open a new tab with this item.url, that information willl be appended as a redirection (this return avoids this)

					return;
				}

				//normalize responseStatus
				var responseStatus = oHttp.responseStatus;
				if (responseStatus === 0)
					responseStatus = -1;

				//DO NOT EDIT:
				this.cache[originalURI].statuses.push(responseStatus);
				this.cache[originalURI].urlRedirections.push(oHttp.URI.spec);
				if (originalURI != oHttp.URI.spec) {
					this.cacheRedirects[oHttp.URI.spec] = originalURI;
					this.cache[originalURI].urlLast = oHttp.URI.spec;
				} else {
					var lastURL = '';
					try {
						lastURL = oHttp.URI.resolve(oHttp.getResponseHeader('Location'))
					} catch (e) {}
					if (lastURL != '' && lastURL != oHttp.URI.spec) {
						this.cacheRedirects[lastURL] = originalURI;
						this.cache[originalURI].urlLast = lastURL;
					}
				}
				this.cache[originalURI].isDownload = oHttp.channelIsForDownload || false;
				this.cache[originalURI].requestMethod = oHttp.requestMethod || 'GET';
				//detect downloads
				try {
					var contentDispositionHeader = oHttp.contentDispositionHeader;
					this.cache[originalURI].isDownload = true;
				} catch (e) {}
				if (this.cache[originalURI].isDownload || (oHttp.contentType.trim() != '' && contentTypesTxt.indexOf(oHttp.contentType) === -1)) {
					this.cache[originalURI].isDownload = true;
					this.cache[originalURI].contentType = oHttp.contentType;
					oHttp.cancel(Components.results.NS_BINDING_ABORTED);
				}

				//if the request is from XMLHttpRequester, the "Location:" header, maybe is not reflected in the redirections,
				//then we need to get if from the responseHeaders.
				//aData[URL] is equal to the original URI. But then,
				//Since the redirectionn is not exposed, if we change the current Location to
				//this.cache[originalURI].lastURL = oHttp.getResponseHeader('Location')
				//we will inherit all the properties of the previous URL, such contenttype, etc.
				//So, dont use this:
				//this.cache[originalURI].remoteAddress = oHttp.remoteAddress || 0;
				//this.cache[originalURI].remotePort = oHttp.remotePort || 0;
				//this.cache[originalURI].contentLength = oHttp.contentLength || 0;
				//this.cache[originalURI].contentType = oHttp.contentType || '';
				//this.cache[originalURI].contentCharset = oHttp.contentCharset || '';

			},
			check: function(aURL, aFunction) {
				this.queue[this.queue.length] = [aURL, aFunction];
				this.next();
			},
			next: function() {
				if (this.itemsNetworking < ODPExtension.preferenceGet('link.checker.threads')) {
					var next = this.queue.shift();
					if ( !! next) {
						this._check(next[0], next[1]);
						this.next();
					}
				}
			},
			_check: function(aURL, aFunction, letsTryAgainIfFail) {
				this.itemsWorking++;
				this.itemsNetworking++;

				//ODPExtension.dump('check:function:'+aURL);
				if (typeof(letsTryAgainIfFail) == 'undefined')
					letsTryAgainIfFail = 1;

				if (!this.cache[aURL]) {
					this.cache[aURL] = {};
					var aData = this.cache[aURL];
					aData.stop = false;

					aData.isDownload = false;

					aData.statuses = [];
					aData.headers = '';
					aData.contentType = '';
					aData.requestMethod = 'GET';

					aData.urlRedirections = [];
					aData.urlOriginal = aURL;
					aData.urlLast = aURL;
					aData.domain = '';
					aData.subdomain = '';
					aData.ip = '';
					aData.ns = '';

					aData.checkType = '';
					aData.siteType = 'html'; //html, rss, atom, pdf, media, flash

					aData.html = '';
					aData.htmlRequester = '';
					aData.htmlTab = '';
					aData.domTree = '';
					aData.txt = '';
					aData.language = '';

					aData.hash = '';
					aData.ids = [];

					aData.title = '';
					aData.metaDescription = '';

					aData.externalContent = [];
					aData.linksInternal = []
					aData.linksExternal = []
					aData.mediaCount = 0;
					aData.wordCount = 0;
					aData.hasFrameset = 0;
					aData.frames = 0;
					aData.dateStart = ODPExtension.now();
					aData.dateEnd = aData.dateStart;
					aData.intrusivePopups = 0;
					aData.removeFromBrowserHistory = !ODPExtension.isVisitedURL(aURL);

				} else {
					var aData = this.cache[aURL];
				}
				var oRedirectionAlert = this;
				var Requester = new XMLHttpRequest();
				try {
					Requester.mozAnon = true;
				} catch (e) {} //If true, the request will be sent without cookie and authentication headers.
				try {
					Requester.mozBackgroundRequest = true;
				} catch (e) {} //Indicates whether or not the object represents a background service request. If true, no load group is associated with the request, and security dialogs are prevented from being shown to the user. Requires elevated privileges to access.

				var loaded = false;
				var timer;
				Requester.timeout = timeoutAfter;
				Requester.onload = function() {
					if (loaded)
						return null;

					aData.checkType = 'XMLHttpRequestSuccess'
					loaded = true;
					aData.stop = true;
					aData.headers = Requester.getAllResponseHeaders();
					aData.htmlRequester = Requester.responseText;
					aData.html = Requester.responseText;
					aData.ids = ODPExtension.arrayUnique(ODPExtension.arrayMix(aData.ids, aData.html.match(/(pub|ua)-[^"'&\s]+/gmi) || []))
					aData.contentType = Requester.getResponseHeader('Content-Type');
					//now get the response as UTF-8

					var aTab = ODPExtension.tabOpen('about:blank', false, false, true);
					aTab.setAttribute('hidden', ODPExtension.preferenceGet('link.checker.hidden.tabs'));
					aTab.ODPExtensionLinkChecker = true;
					aTab.ODPExtensionOriginalURI = aURL;
					aTab.ODPExtensionExternalContent = [];
					aTab.ODPExtensionURIsStatus = [];

					var newTabBrowser = ODPExtension.browserGetFromTab(aTab);

					var timedout = -1;
					//timedout = -1 | tab did not timedout
					//timedout = 1 | tab timedout (did not fired DOM CONTENT LOAD)
					//timedout = 2 | tab did load (did fired DOM CONTENT LOAD)

					function onTabLoad() {
						oRedirectionAlert.next();

						newTabBrowser.removeEventListener("DOMContentLoaded", DOMContentLoaded, false);

						timedout = 3;
						aData.checkType = 'aTab'
						aData.externalContent = aTab.ODPExtensionExternalContent;

						var aDoc = ODPExtension.documentGetFromTab(aTab);
						aData.urlLast = ODPExtension.tabGetLocation(aTab);

						if (aDoc.documentURI.indexOf('about:') === 0 || aDoc.documentURI.indexOf('chrome:') === 0) {
							aDoc = ODPExtension.toDOM(aData.htmlRequester, aData.urlLast);
						}

						aData.contentType = aDoc.contentType;
						//a tab may redirect to binary content
						if (aData.contentType != '' && contentTypesTxt.indexOf(aData.contentType) === -1) {
							aData.isDownload = true;
						}

						aData.title = ODPExtension.documentGetTitle(aDoc);
						aData.metaDescription = ODPExtension.documentGetMetaDescription(aDoc);

						//detect meta/js redirect
						if (aData.urlRedirections[aData.urlRedirections.length - 1] != aData.urlLast) {
							aData.statuses.push('meta/js');
							//save the redirection
							aData.urlRedirections.push(aData.urlLast);
							//get the last status, if was meta/js redirect
							if (!aTab.ODPExtensionURIsStatus[aData.urlLast]) {} else {
								aData.statuses.push(aTab.ODPExtensionURIsStatus[aData.urlLast]);
							}
						}

						aData.subdomain = ODPExtension.getSubdomainFromURL(aData.urlLast);
						aData.domain = ODPExtension.getDomainFromURL(aData.urlLast);
						aData.ip = ODPExtension.getIPFromDomain(aData.subdomain);

						//links
						aData.linksInternal = []
						aData.linksExternal = []

						var links = ODPExtension.getAllLinksItems(aDoc);
						for (var i = 0, length = links.length; i < length; i++) {
							var link = links[i];
							if (link.href && link.href != '' && link.href.indexOf('http') === 0) {
								var aDomain = ODPExtension.getDomainFromURL(link.href)
								if (aDomain != aData.domain)
									aData.linksExternal[aData.linksExternal.length] = {
										url: String(link.href),
										anchor: link.innerHTML,
										domain: aDomain
								};
								else
									aData.linksInternal[aData.linksInternal.length] = {
										url: String(link.href),
										anchor: link.innerHTML,
										domain: aDomain
								};
							}
						}
						link = links = null

						if (!aDoc.mediaCounted) {
							aData.htmlTab = new XMLSerializer().serializeToString(aDoc);
							aData.html = aData.htmlTab;
							aData.ids = ODPExtension.arrayUnique(ODPExtension.arrayMix(aData.ids, aData.html.match(/(pub|ua)-[^"'&\s]+/gmi) || []))

							aData.domTree = ODPExtension.domTree(aDoc);
							aData.hash = ODPExtension.md5(JSON.stringify(aData.domTree));

							aData.mediaCount = 0;
							for (var id in tagsMedia)
								aData.mediaCount += aDoc.getElementsByTagName(tagsMedia[id]).length;
						}

						//frames
						aData.hasFrameset = aDoc.getElementsByTagName('frameset').length;
						aData.frames = aDoc.getElementsByTagName('iframe').length + aDoc.getElementsByTagName('frame').length;

						aData.framesURLs = [];
						var frames = aDoc.getElementsByTagName('iframe')
						for (var i = 0; i < frames.length; i++) {
							aData.framesURLs[aData.framesURLs.length] = frames[i].src;
						}
						var frames = aDoc.getElementsByTagName('frame')
						for (var i = 0; i < frames.length; i++) {
							aData.framesURLs[aData.framesURLs.length] = frames[i].src;
						}

						//"site type"
						if(aData.htmlTab.indexOf('xmlns=\'http://www.w3.org/2005/Atom\'') !== -1 || aData.htmlTab.indexOf('xmlns="http://www.w3.org/2005/Atom"') !== -1)
							aData.siteType = 'atom';
						else if(aData.htmlTab.indexOf('<rss version="') !== -1)
							aData.siteType = 'rss';
						else if(aData.htmlTab.indexOf('xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns') !== -1)
							aData.siteType = 'rdf';
						else if(ODPExtension.urlFlagsHashFlash.indexOf(aData.hash) !== -1)
							aData.siteType = 'flash';


						//clone doc, do not touch the doc in the tab
						aDoc = aDoc.cloneNode(true);
						for (var id in tagsMedia) {
							var tags = aDoc.getElementsByTagName(tagsMedia[id]);
							var i = tags.length;
							while (i--) {
								tags[i].parentNode && tags[i].parentNode.removeChild(tags[i]);
							}
						}
						for (var id in tagsNoContent) {
							var tags = aDoc.getElementsByTagName(tagsNoContent[id]);
							var i = tags.length;
							while (i--)
								tags[i].parentNode.removeChild(tags[i]);
						}
						ODPExtension.removeComments(aDoc);

						try {
							aDoc = new XMLSerializer().serializeToString(aDoc.body);
						} catch (e) {
							aDoc = new XMLSerializer().serializeToString(aDoc);
						}
						aData.txt = ODPExtension.htmlSpecialCharsDecode(ODPExtension.stripTags(aDoc, ' ').replace(/[\t| ]+/g, ' ').replace(/\n\s+/g, '\n').replace(/\s+\n/g, '\n').trim());
						aData.language = ODPExtension.detectLanguage(aData.txt);
						aData.wordCount = aData.txt.split(' ').length

						ODPExtension.disableTabFeatures(ODPExtension.windowGetFromTab(aTab), aTab, aData)
						ODPExtension.urlFlag(aData);

						//because the linkcheck runs in a tab, it add stuff to the browser history that shouldn't be added
						//http://forums.mozillazine.org/viewtopic.php?p=9070125#p9070125
						if (aData.removeFromBrowserHistory)
							ODPExtension.removeURLFromBrowserHistory(aURL);

						ODPExtension.tabClose(aTab);

						oRedirectionAlert.cache[aURL] = aTab = aDoc = newTabBrowser = null;

						aData.dateEnd = ODPExtension.now();
						if (debug)
							ODPExtension.fileWrite('tito.txt', JSON.stringify(aData));
						aFunction(aData, aURL)

						aData = null;

						oRedirectionAlert.next();

						oRedirectionAlert.itemsDone++;
						if (oRedirectionAlert.itemsDone == oRedirectionAlert.itemsWorking)
							oRedirectionAlert.unLoad();
					}

					function DOMContentLoaded(aEvent) {
						oRedirectionAlert.next();

						if (timedout === -1) {
							var aDoc = aEvent.originalTarget;
							if (!aDoc.defaultView)
								var topDoc = aDoc;
							else
								var topDoc = aDoc.defaultView.top.document;

							//its a frame
							if (aDoc != topDoc) {} else {

								timedout = 2;


								aData.htmlTab = new XMLSerializer().serializeToString(aDoc);
								aData.html = aData.htmlTab;
								aData.ids = ODPExtension.arrayUnique(ODPExtension.arrayMix(aData.ids, aData.html.match(/(pub|ua)-[^"'&\s]+/gmi) || []))

								aData.domTree = ODPExtension.domTree(aDoc);
								aData.hash = ODPExtension.md5(JSON.stringify(aData.domTree));

								//Check for framed redirects
								var aURI = '';

								if(ODPExtension.urlFlagsHashFramesetRedirect.indexOf(aData.hash) !== -1 && aDoc.getElementsByTagName('frame')[0] && aDoc.getElementsByTagName('frame')[0].src)
									var aURI = aDoc.getElementsByTagName('frame')[0].src;
								else if(ODPExtension.urlFlagsHashFramesetRedirect.indexOf(aData.hash) !== -1 && aDoc.getElementsByTagName('iframe')[0] && aDoc.getElementsByTagName('iframe')[0].src)
									var aURI = aDoc.getElementsByTagName('iframe')[0].src;

								if(aURI != ''){

									timedout = -1
									aData.statuses.push('framed');
									if (!ODPExtension.preferenceGet('link.checker.use.cache'))
										newTabBrowser.loadURIWithFlags(aURI, newTabBrowser.webNavigation.LOAD_FLAGS_BYPASS_PROXY | newTabBrowser.webNavigation.LOAD_FLAGS_BYPASS_CACHE | newTabBrowser.webNavigation.LOAD_ANONYMOUS | newTabBrowser.webNavigation.LOAD_FLAGS_BYPASS_HISTORY, null, null);
									else
										newTabBrowser.loadURIWithFlags(aURI, newTabBrowser.webNavigation.LOAD_ANONYMOUS | newTabBrowser.webNavigation.LOAD_FLAGS_BYPASS_HISTORY, null, null);
								} else {

									oRedirectionAlert.itemsNetworking--;
									oRedirectionAlert.next();

									aDoc.mediaCounted = true;
									for (var id in tagsMedia)
										aData.mediaCount += aDoc.getElementsByTagName(tagsMedia[id]).length;

									for (var id in tagsMedia) {
										var tags = aDoc.getElementsByTagName(tagsMedia[id]);
										var i = tags.length;
										while (i--) {
											try {
												tags[i].pause();
												try {
													tags[i].stop();
												} catch (e) {
													try {
														tags[i].stop();
													} catch (e) {}
												}
											} catch (e) {
												try {
													tags[i].stop();
												} catch (e) {}
											}
										}
									}

									setTimeout(function() {
										onTabLoad()
									}, 12000);

								}
							}
						}
					}
					newTabBrowser.addEventListener("DOMContentLoaded", DOMContentLoaded, false);

					newTabBrowser.webNavigation.allowAuth = false;
					newTabBrowser.webNavigation.allowImages = false;
					try {
						newTabBrowser.webNavigation.allowMedia = false; //does not work
					} catch (e) {}
					newTabBrowser.webNavigation.allowJavascript = true;
					newTabBrowser.webNavigation.allowMetaRedirects = true;
					newTabBrowser.webNavigation.allowPlugins = false;
					newTabBrowser.webNavigation.allowWindowControl = false;
					newTabBrowser.webNavigation.allowSubframes = true;

					//newTabBrowser.loadURI(aURL);
					if (!ODPExtension.preferenceGet('link.checker.use.cache'))
						newTabBrowser.loadURIWithFlags(aURL, newTabBrowser.webNavigation.LOAD_FLAGS_BYPASS_PROXY | newTabBrowser.webNavigation.LOAD_FLAGS_BYPASS_CACHE | newTabBrowser.webNavigation.LOAD_ANONYMOUS | newTabBrowser.webNavigation.LOAD_FLAGS_BYPASS_HISTORY, null, null);
					else
						newTabBrowser.loadURIWithFlags(aURL, newTabBrowser.webNavigation.LOAD_ANONYMOUS | newTabBrowser.webNavigation.LOAD_FLAGS_BYPASS_HISTORY, null, null);
					setTimeout(function() {
						if (timedout === -1) {
							timedout = 1;
							oRedirectionAlert.itemsNetworking--;
							oRedirectionAlert.next();
							onTabLoad();
						}
					}, timeoutAfter + 5000); //give 60 seconds to load, else, just forget it.
					return null;
				};
				Requester.onerror = Requester.onabort = function(TIMEDOUT) {
					oRedirectionAlert.next();

					oRedirectionAlert.itemsNetworking--;
					aData.checkType = 'XMLHttpRequestError'
					//ODPExtension.dump('Requester.onerror');
					//ODPExtension.dump(TIMEDOUT);
					if (letsTryAgainIfFail == 1 && !aData.isDownload) {
						//ODPExtension.dump('sending again..'+aURL);
						oRedirectionAlert.itemsDone++;
						clearTimeout(timer);

						aData.statuses = [];
						aData.urlRedirections = [];

						oRedirectionAlert._check(aURL, aFunction, 0);
					} else {
						if (loaded)
							return null;
						loaded = true;

						if (aData.isDownload) {
							aData.checkType = 'Attachment'
							if (aData.contentType == '') //the raw contentType sometimes has the "charset" and other stuff, only get it if is not already set.
								aData.contentType = Requester.getResponseHeader('Content-Type');
							aData.headers = Requester.getAllResponseHeaders();

						} else if (typeof(TIMEDOUT) != 'undefined' && TIMEDOUT === 'TIMEDOUT') {
							aData.statuses.push(-5)
							aData.checkType = 'XMLHttpRequestTimeout'
						} else if (typeof(TIMEDOUT) != 'undefined' && TIMEDOUT === 'ABORTED') {
							//oHttp.responseStatus = -5
							aData.stop = true;
							aData.checkType = 'XMLHttpRequestAbortMedia'
						} else {
							if (
								Components
								.classes["@mozilla.org/network/io-service;1"]
								.getService(Components.interfaces.nsIIOService)
								.offline ||
								false //ODPExtension.getIPFromDomain('www.google.com', true) === '' // this blocks the browser because is sync
							) {
								aData.statuses.push(-1337)
							} else {
								try {
									aData.statuses.push(ODPExtension.createTCPErrorFromFailedXHR(Requester));
								} catch (e) {
									try {
										aData.statuses.push(Requester.status);
									} catch (e) {
										aData.statuses.push(-1);
									}
								}
								if (aData.statuses[aData.statuses.length - 1] === 0)
									aData.statuses[aData.statuses.length - 1] = -1;
							}
						}
						//	oRedirectionAlert.onExamineResponse(oHttp);

						aData.stop = true;

						aData.subdomain = ODPExtension.getSubdomainFromURL(aData.urlLast);
						aData.domain = ODPExtension.getDomainFromURL(aData.urlLast);
						aData.ip = ODPExtension.getIPFromDomain(aData.subdomain);

						ODPExtension.urlFlag(aData);
						oRedirectionAlert.cache[aURL] = null;

						aData.dateEnd = ODPExtension.now();

						if (debug)
							ODPExtension.fileWrite('tito.txt', JSON.stringify(aData));
						aFunction(aData, aURL)

						aData = null;
						oRedirectionAlert.next();
						oRedirectionAlert.itemsDone++;
						if (oRedirectionAlert.itemsDone == oRedirectionAlert.itemsWorking)
							oRedirectionAlert.unLoad();
					}
					oRedirectionAlert.next();
					return null;
				};
				Requester.open("GET", aURL, true);
				if (!ODPExtension.preferenceGet('link.checker.use.cache'))
					Requester.channel.loadFlags |= Components.interfaces.nsIRequest.LOAD_FLAGS_BYPASS_PROXY | Components.interfaces.nsIRequest.LOAD_BYPASS_CACHE | Components.interfaces.nsIRequest.LOAD_ANONYMOUS | Components.interfaces.nsIRequest.LOAD_FLAGS_BYPASS_HISTORY;
				else
					Requester.channel.loadFlags |= Components.interfaces.nsIRequest.LOAD_ANONYMOUS | Components.interfaces.nsIRequest.LOAD_FLAGS_BYPASS_HISTORY

				if (letsTryAgainIfFail === 0) {
					Requester.setRequestHeader('Referer', aURL);
				} else {
					Requester.setRequestHeader('Referer', 'https://www.google.com/search?q=' + ODPExtension.encodeUTF8(aURL));
				}
				Requester.send(null);
				//in some situations, timeout is maybe ignored, but neither onload, onerror nor onabort are called
				timer = setTimeout(function() {
					if (!loaded) {
						//ODPExtension.dump('aborted'+aURL);
						Requester.onerror('TIMEDOUT');
					}
				}, timeoutAfter + 5000);
				//ODPExtension.dump('check');
			}
		};

		var oRedirectionAlert = new RedirectionAlert();
		oRedirectionAlert.init();

		return oRedirectionAlert;
	}
	//https://developer.mozilla.org/en-US/docs/How_to_check_the_security_state_of_an_XMLHTTPRequest_over_SSL
	this.createTCPErrorFromFailedXHR = function(xhr) {
		var status = xhr.channel.QueryInterface(Components.interfaces.nsIRequest).status;

		var errType;
		var errName = -1;
		if ((status & 0xff0000) === 0x5a0000) { // Security module
			const nsINSSErrorsService = Components.interfaces.nsINSSErrorsService;
			var nssErrorsService = Components.classes['@mozilla.org/nss_errors_service;1'].getService(nsINSSErrorsService);
			var errorClass;
			// getErrorClass will throw a generic NS_ERROR_FAILURE if the error code is
			// somehow not in the set of covered errors.
			try {
				errorClass = nssErrorsService.getErrorClass(status);
			} catch (ex) {
				errorClass = 'SecurityProtocol';
			}
			if (errorClass == nsINSSErrorsService.ERROR_CLASS_BAD_CERT) {
				errType = 'SecurityCertificate';
			} else {
				errType = 'SecurityProtocol';
			}

			// NSS_SEC errors (happen below the base value because of negative vals)
			if ((status & 0xffff) < Math.abs(nsINSSErrorsService.NSS_SEC_ERROR_BASE)) {
				// The bases are actually negative, so in our positive numeric space, we
				// need to subtract the base off our value.
				var nssErr = Math.abs(nsINSSErrorsService.NSS_SEC_ERROR_BASE) - (status & 0xffff);
				switch (nssErr) {
					case 11: // SEC_ERROR_EXPIRED_CERTIFICATE, sec(11)
						errName = 'SecurityExpiredCertificateError';
						break;
					case 12: // SEC_ERROR_REVOKED_CERTIFICATE, sec(12)
						errName = 'SecurityRevokedCertificateError';
						break;

						// per bsmith, we will be unable to tell these errors apart very soon,
						// so it makes sense to just folder them all together already.
					case 13: // SEC_ERROR_UNKNOWN_ISSUER, sec(13)
					case 20: // SEC_ERROR_UNTRUSTED_ISSUER, sec(20)
					case 21: // SEC_ERROR_UNTRUSTED_CERT, sec(21)
					case 36: // SEC_ERROR_CA_CERT_INVALID, sec(36)
						errName = 'SecurityUntrustedCertificateIssuerError';
						break;
					case 90: // SEC_ERROR_INADEQUATE_KEY_USAGE, sec(90)
						errName = 'SecurityInadequateKeyUsageError';
						break;
					case 176: // SEC_ERROR_CERT_SIGNATURE_ALGORITHM_DISABLED, sec(176)
						errName = 'SecurityCertificateSignatureAlgorithmDisabledError';
						break;
					default:
						errName = 'SecurityError';
						break;
				}
			} else {
				var sslErr = Math.abs(nsINSSErrorsService.NSS_SSL_ERROR_BASE) - (status & 0xffff);
				switch (sslErr) {
					case 3: // SSL_ERROR_NO_CERTIFICATE, ssl(3)
						errName = 'SecurityNoCertificateError';
						break;
					case 4: // SSL_ERROR_BAD_CERTIFICATE, ssl(4)
						errName = 'SecurityBadCertificateError';
						break;
					case 8: // SSL_ERROR_UNSUPPORTED_CERTIFICATE_TYPE, ssl(8)
						errName = 'SecurityUnsupportedCertificateTypeError';
						break;
					case 9: // SSL_ERROR_UNSUPPORTED_VERSION, ssl(9)
						errName = 'SecurityUnsupportedTLSVersionError';
						break;
					case 12: // SSL_ERROR_BAD_CERT_DOMAIN, ssl(12)
						errName = 'SecurityCertificateDomainMismatchError';
						break;
					default:
						errName = 'SecurityError';
						break;
				}
			}
		} else {
			errType = 'Network';
			switch (status) {
				// connect to host:port failed
				case 0x804B000C: // NS_ERROR_CONNECTION_REFUSED, network(13)
					errName = -4; //ConnectionRefused
					break;
					// network timeout error
				case 0x804B000E: // NS_ERROR_NET_TIMEOUT, network(14)
					errName = -5; //NetworkTimeout
					break;
					// hostname lookup failed
				case 0x804B001E: // NS_ERROR_UNKNOWN_HOST, network(30)
					errName = -1; //DomainNotFound
					break;
				case 0x804B0047: // NS_ERROR_NET_INTERRUPT, network(71)
					errName = -1337; //NetworkInterrupt
					break;
				default:
					errName = -4; //NetworkError
					break;
			}
		}
		return errName;
	}

	this.disableTabFeatures = function(aWindow, aTab, aData) {

		var events = ['beforeunload', 'unbeforeunload']
		var noop = function(){}
		var yesop = function(){ return true; }
		var empty = function(){ return 'something'; }

		this.disableTabFeaturesCounter(aWindow.onbeforeunload, aData);
		this.disableTabFeaturesCounter(aWindow.beforeunload, aData);
		this.disableTabFeaturesCounter(aWindow.wrappedJSObject.onbeforeunload, aData);
		this.disableTabFeaturesCounter(aWindow.wrappedJSObject.beforeunload, aData);

		var v = aWindow.wrappedJSObject;
		for (var id in events) {
			if (v._eventTypes && v._eventTypes[events[id]]) {
				var r = v._eventTypes[events[id]];
				for (var s = 0; s < r.length; s++) {
					this.disableTabFeaturesCounter(r[events[id]], aData);
					v.removeEventListener(events[id], r[events[id]], false);
					v.removeEventListener(events[id], r[events[id]], true);
				}
				v._eventTypes[events[id]] = [];
			}
		}

		aWindow.wrappedJSObject.alert = aWindow.wrappedJSObject.focus = aWindow.alert = aWindow.wrappedJSObject.onbeforeunload = aWindow.wrappedJSObject.beforeunload = aWindow.onbeforeunload = aWindow.beforeunload = aWindow.focus = noop
		aWindow.wrappedJSObject.prompt = aWindow.prompt = empty
		aWindow.wrappedJSObject.confirm =  aWindow.confirm = yesop

		this.foreachFrame(aWindow.wrappedJSObject, function(aDoc) {
			var aWin = aDoc.defaultView;

			var v = aWin;
			for (var id in events) {
				if (v._eventTypes && v._eventTypes[events[id]]) {
					var r = v._eventTypes[events[id]];
					for (var s = 0; s < r.length; s++) {
						ODPExtension.disableTabFeaturesCounter(r[events[id]], aData);
						v.removeEventListener(events[id], r[events[id]], false);
						v.removeEventListener(events[id], r[events[id]], true);
					}
					v._eventTypes[events[id]] = [];
				}
			}
			ODPExtension.disableTabFeaturesCounter(aWin.onbeforeunload, aData);
			ODPExtension.disableTabFeaturesCounter(aWin.beforeunload, aData);

			aWin.alert = aWin.onbeforeunload = aWin.beforeunload = aWin.focus = noop;
			aWin.prompt = empty
			aWin.confirm = yesop
		});
	}
	this.disableTabFeaturesCounter = function(aFunction, aData) {
		if ( !! aFunction && !! aFunction.toSource) {
			var src = aFunction.toSource();
			if (src.indexOf('return') != -1 || src.indexOf('alert') != -1)
				aData.intrusivePopups++;
		}
	}

	// comments of the error codes based or taken from http://www.dmoz.org/docs/en/errorcodes.html
	this.urlFlag = function(aData) {

		aData.status = {};
		aData.status.error = true;
		aData.status.code = false;
		aData.status.canDelete = false;
		aData.status.canUnreview = false;
		aData.status.suspicious = [];

		//HTTP redirections to HTTPS are not perceived as a redirection, log it
		if (aData.urlRedirections.length === 1 && aData.urlOriginal != aData.urlLast)
			aData.urlRedirections.push(aData.urlLast)

		var lastStatus = aData.statuses[aData.statuses.length - 1];

		var urlMalformed = aData.urlLast.indexOf('https:///') != -1 || aData.urlLast.indexOf('http:///') != -1 || aData.subdomain.indexOf(',') !== -1 || aData.subdomain.indexOf('%') !== -1 || !this.isPublicURL(aData.urlLast);

		//-6 BAd URL
		if (false || urlMalformed || lastStatus == 414 // Request-URI Too Large - The URL (usually created by a GET form request) is too large for the server to handle. Check to see that a lot of garbage didn't somehow get pasted in after the URL.
		|| lastStatus == 413 // Request Entity Too Large - The server is refusing to process a request because the request entity is larger than the server is willing or able to process. Should never occur for Robozilla.
		//|| lastStatus == 400 // Bad Request	Usually occurs due to a space in the URL or other malformed URL syntax. Try converting spaces to %20 and see if that fixes the error.
		) {
			aData.status.code = -6;
			aData.status.errorString = 'Bad URL';
			aData.status.errorStringUserFriendly = 'Bad URL';
			aData.status.canUnreview = true;

			//-1 	Unable to Resolve Host 	They didn't pay their bill for their Domain name.
		} else if (false || aData.statuses.indexOf(-1) != -1 || aData.statuses.indexOf('DomainNotFound') != -1) {
			aData.status.code = -1;
			aData.status.errorString = 'Domain Not Found';
			aData.status.errorStringUserFriendly = 'Does Not Work';
			aData.status.canDelete = true;

			//-401  SSL Error
		} else if (false || aData.statuses.indexOf('SecurityProtocol') != -1 || aData.statuses.indexOf('SecurityCertificate') != -1 || aData.statuses.indexOf('SecurityExpiredCertificateError') != -1 || aData.statuses.indexOf('SecurityRevokedCertificateError') != -1 || aData.statuses.indexOf('SecurityUntrustedCertificateIssuerError') != -1 || aData.statuses.indexOf('SecurityInadequateKeyUsageError') != -1 || aData.statuses.indexOf('SecurityCertificateSignatureAlgorithmDisabledError') != -1 || aData.statuses.indexOf('SecurityError') != -1 || aData.statuses.indexOf('SecurityNoCertificateError') != -1 || aData.statuses.indexOf('SecurityBadCertificateError') != -1 || aData.statuses.indexOf('SecurityUnsupportedCertificateTypeError') != -1 || aData.statuses.indexOf('SecurityUnsupportedTLSVersionError') != -1 || aData.statuses.indexOf('SecurityCertificateDomainMismatchError') != -1 || aData.statuses.indexOf('SecurityCertificateDomainMismatchError') != -1) {
			aData.status.code = -401;
			aData.status.errorString = 'SSL Error: ' + aData.statuses.join(',');
			aData.status.errorStringUserFriendly = 'SSL Error';
			aData.status.canUnreview = true;

			//-4 	Can't connect 	We can't connect to the HTTP server. The server is there but it didn't want to talk to Robozilla on the specified port.
		} else if (false || aData.statuses.indexOf(-4) != -1 || aData.statuses.indexOf('ConnectionRefused') != -1 || aData.statuses.indexOf('NetworkError') != -1) {
			aData.status.code = -4;
			aData.status.errorString = 'Can\'t Connect';
			aData.status.errorStringUserFriendly = 'Can\'t Connect';
			aData.status.canUnreview = true;

			//-5 	Timeout Robozilla connected OK, and sent the request but Robozilla timed out waiting to fetch the page. This happens sometimes on really busy servers.
		} else if (false || aData.statuses.indexOf(-5) != -1 || aData.statuses.indexOf('NetworkTimeout') != -1 || lastStatus == 408 // Request Time-Out	- The server took longer than expected to return a page, and timed out. Similar to -5, but generated by the server, rather than Robozilla.
		|| lastStatus == 504 // Gateway Timeout - A server being used by this server has not responded in time.
		) {
			aData.status.code = -5;
			aData.status.errorString = 'Network Timeout';
			aData.status.errorStringUserFriendly = 'Network Timeout';
			aData.status.canUnreview = true;

			//-1337 	Local Network error - probably the internet is gone
		} else if (false || aData.statuses.indexOf(-1337) != -1 || aData.statuses.indexOf('NetworkInterrupt') != -1) {
			aData.status.code = -1337;
			aData.status.errorString = 'Internet Gone!?';
			aData.status.errorStringUserFriendly = 'Internet Gone!?';

			//404 	Not Found
		} else if (false || lastStatus == 404 // Not Found
		|| lastStatus == 410 // Gone
		) {
			aData.status.code = lastStatus;
			aData.status.errorString = 'Not Found';
			aData.status.errorStringUserFriendly = 'Not Found';
			aData.status.canUnreview = true;

			//Server Error	The server returned an error code that looks like permanent.
		} else if (false || lastStatus == 505 // HTTP Version Not Supported

		|| lastStatus == 503 // Server Overload
		|| lastStatus == 502 // Bad Gateway
		|| lastStatus == 501 // Not Implemented
		|| lastStatus == 500 // Server error

		|| lastStatus == 417 // Expectation Failed
		|| lastStatus == 416 // Requested Range Not Satisfiable
		|| lastStatus == 415 // Unsupported Media Type


		|| lastStatus == 412 // Precondition Failed
		|| lastStatus == 411 // Length Required

		|| lastStatus == 409 // Conflict

		|| lastStatus == 407 // Proxy Authentication Required
		|| lastStatus == 406 // Not Acceptable
		|| lastStatus == 405 // Method Not Allowed

		|| lastStatus == 403 // Forbidden

		|| lastStatus == 402 // Payment Required.
		|| lastStatus == 401 // Unauthorised
		) {
			aData.status.code = lastStatus;
			aData.status.errorString = 'Server Error';
			aData.status.errorStringUserFriendly = 'Server Error';
			aData.status.canUnreview = true;

			//-8 	Empty Page
		} else if (false  //nothing
		  || (aData.hash == '869a4716516c5ef5f369913fa60d71b8' && aData.wordCount < 20)

		) {
			aData.status.code = -8;
			aData.statuses.push(aData.status.code);
			aData.status.errorString = 'Empty Page';
			aData.status.errorStringUserFriendly = 'Empty Page';
			aData.status.canUnreview = true;
			aData.status.match = aData.txt;

			//-8 	Tiny Page
		} else if (false  //nothing
		  || (aData.wordCount < 3 && aData.mediaCount.length < 1) // few words, no media content

		) {
			aData.status.code = -8;
			aData.statuses.push(aData.status.code);
			aData.status.errorString = 'Tiny Page';
			aData.status.errorStringUserFriendly = 'Tiny Page';
			aData.status.canUnreview = true;
			aData.status.match = aData.txt;

			//-1340 	Redirect OK	The server redirects to another page but it's OK and  probably very likelly can be autofixed
		} else if (
		(
			aData.statuses.indexOf(300) !== -1 // Moved
		|| aData.statuses.indexOf(301) !== -1 // Redirect Permanently
		|| aData.statuses.indexOf(302) !== -1 // Redirect Temporarily
		//|| aData.statuses.indexOf(303) !== -1 // See Other
		|| aData.statuses.indexOf('meta/js') !== -1 // meta/js redirect
		|| aData.urlOriginal != aData.urlLast) && this.redirectionOKAutoFix(aData.urlOriginal, aData.urlLast)) {
			aData.status.code = -1340;
			aData.status.errorString = 'Redirect OK Candidate 4 Autofix';
			aData.status.errorStringUserFriendly = 'OK';
			aData.status.error = false;

			//-1338 	Redirect OK	The server redirects to another page but it's OK
		} else if (
		(
			aData.statuses.indexOf(300) !== -1 // Moved
		|| aData.statuses.indexOf(301) !== -1 // Redirect Permanently
		|| aData.statuses.indexOf(302) !== -1 // Redirect Temporarily
		//|| aData.statuses.indexOf(303) !== -1 // See Other
		|| aData.statuses.indexOf('meta/js') !== -1 // meta/js redirect
		|| aData.urlOriginal != aData.urlLast) && this.redirectionOK(aData.urlOriginal, aData.urlLast)) {
			aData.status.code = -1338;
			aData.status.errorString = 'Redirect OK';
			aData.status.errorStringUserFriendly = 'OK';
			aData.status.error = false;

			//-1339 	Redirect Must be corrected The server redirects to another page and must be corrected
		} else if (false || aData.statuses.indexOf(300) !== -1 // Moved
		|| aData.statuses.indexOf(301) !== -1 // Redirect Permanently
		|| aData.statuses.indexOf(302) !== -1 // Redirect Temporarily
		|| aData.statuses.indexOf(303) !== -1 // See Other
		|| aData.statuses.indexOf('meta/js') !== -1 // meta/js redirect
		|| aData.urlOriginal != aData.urlLast) {
			aData.status.code = -1339;
			aData.status.errorString = 'Redirect';
			aData.status.errorStringUserFriendly = 'Redirect';

			//200 OK
		} else if (false || lastStatus == 200  //|| lastStatus == 304 // OK / Not modified
		) {
			aData.status.code = 200;
			aData.status.errorString = 'OK';
			aData.status.errorStringUserFriendly = 'OK';

			aData.status.error = false;

			//-7 	Server Error	The server returned an unknown error code, and is probably mis-configured. The page may still show up okay, but it's a good idea to check it just in case.
		} else {
			aData.status.code = lastStatus;
			aData.status.errorString = 'Unknown Error';
			aData.status.errorStringUserFriendly = 'Unknown Error';
		}

		//most important should go first (example, makes no sense to check for errors in a page that is just parked)
		var array = [''
				, 'pendingRenew'

				, 'forSale'
				, 'parked'

				, 'hacked'
				, 'hijacked'

				, 'gonePermanent'
				, 'notFound'
				, 'serverPage'

				, 'requiresLogin'
				, 'noContent'

				, 'pageErrors'
				, 'serverErrors'

				, 'underConstruction'

				, 'comingSoon'
				, 'suspended'
		]

		var externalContent = []
		for (var id in aData.externalContent)
			externalContent[externalContent.length] = aData.externalContent[id].url;
		aData.ids = this.arrayUnique(this.arrayMix(aData.ids, (externalContent.join('\n')).match(/(pub|ua)-[^"'&\s]+/gmi) || []))
		var data = (aData.urlRedirections.join('\n') + '\n' + externalContent.join('\n') + '\n' + aData.headers + '\n' + aData.html).toLowerCase();
		var breaky = false;
		for (var name in array) {
			if (array[name] != '') {

				//bodyMatch
				for (var id in this['urlFlags'][array[name]]['body']) {
					string = this['urlFlags'][array[name]]['body'][id].trim();
					if ( (string != '' && (data.indexOf(string.toLowerCase().trim()) != -1)) || (aData.hash != '' && this['urlFlags'][array[name]]['hash'].indexOf(aData.hash) != -1)) {
						aData.status.error = true;

						if(! this['urlFlags'][array[name]]['errorCodeApplyOnOKOnly'] || ( this['urlFlags'][array[name]]['errorCodeApplyOnOKOnly'] && aData.status.code == 200)) {
							aData.status.code = this['urlFlags'][array[name]]['errorCode'];
							aData.statuses.push(aData.status.code);
						}

						if (this['urlFlags'][array[name]]['canDelete'])
							aData.status.canDelete = true;
						if (this['urlFlags'][array[name]]['canUnreview'])
							aData.status.canUnreview = true;
						aData.status.errorString = this['urlFlags'][array[name]]['errorString'];
						aData.status.errorStringUserFriendly = this['urlFlags'][array[name]]['errorStringUserFriendly'];
						aData.status.match = string;
						if (aData.hash != '' && this['urlFlags'][array[name]]['hash'].indexOf(aData.hash) != -1)
							aData.status.matchHash = true;

						breaky = true;
						break;
					}
				}
				if (breaky)
					break;
			}
		}

		//suspicious
		if (contentTypesKnown.indexOf(aData.contentType) == -1)
			aData.status.suspicious.push('Unknown content type: ' + aData.contentType);
		if (aData.hash != '' && this.urlFlagsHash.indexOf(aData.hash) != -1)
			aData.status.suspicious.push('Document may has problems');
		if (aData.hasFrameset > 0 && this.urlFlagsHashFrameset.indexOf(aData.hash) === -1 )
			aData.status.suspicious.push('Document has a frameset');
		if (aData.intrusivePopups > 1)
			aData.status.suspicious.push('Window may has problems');
	}

	this.redirectionOKAutoFix = function(oldURL, newURL) {
		if (oldURL == newURL)
			return false;

		oldURL = this.removeWWW(this.removeSchema(this.shortURLAggresive(oldURL))).replace(/\/+$/, '').toLowerCase().trim();
		newURL = this.removeSchema(newURL).replace(/\/+$/, '').replace(/^www\./, '').toLowerCase().trim();

		if (oldURL == newURL)
			return true;
		else
			return false;
	}

	this.redirectionOK = function(oldURL, newURL) {

		if (this.getSchema(oldURL) != this.getSchema(newURL))
			return false;
		oldURL = this.removeWWW(this.removeSchema(oldURL)).replace(/\/+$/, '').toLowerCase().trim();
		newURL = this.removeWWW(this.removeSchema(newURL)).replace(/\/+$/, '').toLowerCase().trim();

		if (oldURL == newURL) {
			return true;
		} else if (newURL.indexOf(oldURL) === 0) {
			return true;
		} else {
			return false;
		}
	}

	return null;

}).apply(ODPExtension);