// https://dl.dropboxusercontent.com/spa/pjlfdak1tmznswp/api_keys.js/public/index.html
// https://github.com/dropbox/dropbox-js/blob/master/doc/getting_started.md
// http://coffeedoc.info/github/dropbox/dropbox-js/master/classes/Dropbox/Client.html

define([
    "jwebkit",
    "jwebkit.ui",
    "jwebdesk",
    "./dropbox"
], function(jwk, ui, jwebdesk, dropboxjs) {
    window.$ = jwk.query;
    function DropBox(owner) {
        jwebdesk.Drive.call(this, owner, {
            title: "Dropbox",
            id: "dropbox"            
        });
    }
    DropBox.prototype = new jwebdesk.Drive();
    DropBox.prototype.constructor = DropBox;
    
    // Private auxiliar functions ---------------------------------------------------------------    
    // Esta función recibe la data de un readdir del api de dropbox de forma cruda como la maneja dropbox.
    // Hay que hacer una traducción de esta data a un formato unificado    
    function to_nodes (entries, parent) {
// console.error("-------------->", entries[0]);            
        var self = this;
        var nodes = [];
        for (var i=0;  i<entries.length; i++) {
            var entry = entries[i];
            //*
            var node = this.create_node({
                source: entry,
                name: entry.name,
                path: entry.path,
                isFolder: entry.isFolder,
                mimeType: entry.mimeType,
                hasThumbnail: entry.hasThumbnail,
                parent: parent,
                // TODO: hay que formatear este campo
                modifiedAt: entry.modifiedAt,
                size: entry.size,
                size_display: entry._json.size
            });
            // console.error("----------------------------->", typeof entry.modifiedAt, entry.modifiedAt.getTime());
            /*/
            var node = new Node({        
                // TODO: una forma de resolver un fetch de sus folders
                root: "dropbox",
                name: entry.name,
                path: entry.path,
                fetched: false,
                isFolder: entry.isFolder,
                mimeType: entry.mimeType,
                extension: ext != name ? ext : "",
                hasThumbnail: entry.hasThumbnail,
                icon: entry.isFolder ? "folder" : ext + " " + entry.mimeType.split("/")[0],
                // TODO: hay que llamar a una función y que resuelva cada caso. No tenemos porque depender del mimeType de dropbox
                drive: self,
                parent: parent,
                // TODO: hay que formatear este campo
                modifiedAt: entry.modifiedAt
            });
            //*/
            nodes.push(node);
        }
        
        var orden = function (a, b) {
            var ret = 0;
            if (a.isFolder && !b.isFolder) ret = -1;
            if (!a.isFolder && b.isFolder) ret = 1;
            if (ret == 0) ret = (a.name.toLowerCase() > b.name.toLowerCase()) ? 1 : -1;
            return ret;
        }
        
        nodes = nodes.sort(orden);
        
        return nodes;
    }
    
    function assert_logged() {    
        if (!this.flag("logged")) {
            this.login();
        }
        return this.wait_flag("logged");
    }

    function assert_readdir(node) {
        var self = this;
        var deferred = jwk.Deferred();
        if (!node.isFolder) return deferred.reject().promise();
        if (node.children) return deferred.resolve(node).promise();
        
        assert_logged.call(this).done(function() {            
            if (!node.fetched && !node.requested) {
                console.assert(self && self.client, "ERROR: this node does not have the Dropbox.Client instantiated");
                self.client.readdir(node.path, function(error, names, stat, entries) {
                    if (error) return console.error(error);
                    var nodes = to_nodes.call(self, entries, node);
                    // node.set("children", nodes);
                    node.children = nodes;
                    deferred.resolve(node);
                });
                // Esto supuestamente impide que se realicen varios fetchs del mismo nodo seguidos (uno tras otro)
                node.requested = true;
                setTimeout(function () {
                    node.requested = false;
                }, 3000);
                
            } else if (node.fetched) {
                deferred.resolve(node);
            } else {
                node.wait_flag("children").done(function(node) {
                    deferred.resolve(node);
                });
            }
        });
        
        return deferred.promise();        
    }

    
    // -------------------------------------------------------------------------------------------
    if (typeof Dropbox.Drivers == "undefined") alert("no se cargó el Dropbox.Redirect"); 
    if (typeof Dropbox.Drivers.Redirect == "undefined") alert("no se cargó el Dropbox.Redirect.Redirect"); 
    if (window.opener && jwk.urlParam("package")) {
        var view = {
            "disable_selection": true,
            "ui_type": "panel.emboss",
            "namespace": "jwk-ui",
            "class": "expand",
            "text": "Connecting to Dropbox..."
        }

        var tree = jwk.ui.display_component(view);
        var proxy = jwk.global.proxy("drive-dropbox-popup");            
        
        var client = new Dropbox.Client({
            key: dropbox.key, sandbox: true
        });
        client.authDriver(new Dropbox.Drivers.Redirect({rememberUser: true}));
        client.authenticate(function(error, client) {
            if (error) {
                return console.error(error);
            }
            client.getUserInfo(function(error, userInfo) {
                if (error) {
                    return showError(error);  // Something went wrong.
                }                
                proxy.trigger("logged", {client: client, name:userInfo.name, root: "dropbox", networkname:"DropBox"});                
            });        
        });
        
    }
    
    // DropBox API functions ----------------------------------------------------------------------
    
    DropBox.prototype.login = function (do_popup) {
        var self = this;
        var win;
        var deferred = jwk.Deferred();
        if (self.client) {
            return deferred.resolve();
        }
        var timer = false;
        var proxy = jwk.global.proxy("drive-dropbox-popup");
        proxy.on("logged", function (n,e) {
            console.log("hago un close del popup");
            var data = jwk.extend({}, e);            
            self.client = new Dropbox.Client({
                network: "dropbox",
                key: data.client._credentials.key,
                sandbox: false
            });
            self.client.authDriver(new Dropbox.Drivers.Redirect({rememberUser: true}));
            self.client.authenticate(function(error, client) {
                if (error) {
                    console.error(error);
                    return deferred.reject(error);
                } else {
                    deferred.resolve(data);
                    self.flag_on("logged");
                }
            });
            console.log("hago un close del popup");
            if (window['popup_dropbox']) window['popup_dropbox'].close();
            delete window['popup_dropbox'];
        });
        var url = jwebdesk.serverURL + "?package=dropbox-drive&apptoken=" + this._apptoken;
        win = jwk.popupWindow(url, "Dropbox login", 600, 600);
        window['popup_dropbox'] = win;
        return deferred;
    }      
    
    DropBox.prototype.logout = function () { }
    
    DropBox.prototype.user = function () {}

    DropBox.prototype.root = function () {}

    DropBox.prototype.writeFile = function (node, data, params) {
        var deferred = jwk.Deferred();
        var self = this;
        
        assert_logged.call(this).done(function() {
            if (true) {
                console.assert(self && self.client, "ERROR: this node does not have the Dropbox.Client instantiated");
                
                var options = {};
                self.client.writeFile(node.path, data, options, function(error, stat) {
                    // console.log(arguments)
                    if (error) {
                        deferred.reject(error);
                        return console.error(error);
                    }
                    node.data_fetched = false; // clear cache: me aseguro de que la próxima lectura refleje la realidad (o sea lo que hay en el servidor)
                    node.data = data;
                    deferred.resolve(node);
                });
                // Esto supuestamente impide que se realicen varios fetchs del mismo nodo seguidos (uno tras otro)
                node.data_requested = true;
                setTimeout(function () {
                    node.data_requested = false;
                }, 3000);
                
            }            
        });
        
        return deferred.promise();        
    }
    
    DropBox.prototype.readFile = function (node) {
        var deferred = jwk.Deferred();
        var self = this;
        
        assert_logged.call(this).done(function() {
            if (!node.data_fetched && !node.data_requested) {
                console.assert(self && self.client, "ERROR: this node does not have the Dropbox.Client instantiated");
                
                var options = {};
                
                self.client.readFile(node.path, options, function(error, data, stat, range) {
                    // console.log(arguments)
                    if (error) return console.error(error);
                    node.data = data;
                    node.data_fetched = true;
                    deferred.resolve(data, node);
                });
                // Esto supuestamente impide que se realicen varios fetchs del mismo nodo seguidos (uno tras otro)
                node.data_requested = true;
                setTimeout(function () {
                    node.data_requested = false;
                }, 3000);
                
            } else if (node.data_fetched && node.data) {
                deferred.resolve(node.data, node);
            } else {
                console.error("????", [node]);
            }
            
        });
        
        return deferred.promise();        
    }
    
    DropBox.prototype.readdir = function (node) {
        var self = this;
        var deferred = jwk.Deferred();
        if (!node.isFolder) return deferred.reject().promise();
        if (node.children) return deferred.resolve(node).promise();
        
        assert_logged.call(this).done(function() {            
            if (!node.fetched && !node.requested) {
                console.assert(self && self.client, "ERROR: this node does not have the Dropbox.Client instantiated");
                self.client.readdir(node.path, function(error, names, stat, entries) {
// console.error("mtime y size y que más hay?", arguments);
                    if (error) return console.error(error);
                    var nodes = to_nodes.call(self, entries, node);                    
                    node.children = nodes;
                    deferred.resolve(node.children, node);
                });
                // Esto supuestamente impide que se realicen varios fetchs del mismo nodo seguidos (uno tras otro)
                node.requested = true;
                setTimeout(function () {
                    node.requested = false;
                }, 3000);
                
            } else if (node.fetched) {
                deferred.resolve(node.children, node);
            } else {
                node.wait_flag("children").done(function(node) {
                    deferred.resolve(node.children, node);
                });
            }
        });        
        
        return deferred.promise();
    }

    DropBox.prototype.getAPI = function () {  }

    DropBox.prototype.link = function (node) {
        console.log("Se pidió un link para el node", [node]);
        var self = this;
        var deferred = jwk.Deferred();
        
        assert_logged.call(this).done(function() {            
            if (!node.fetched && !node.requested) {
                console.assert(self && self.client, "ERROR: this node does not have the Dropbox.Client instantiated");
                self.client.makeUrl(node.path, function(error, url) {
                    console.log("resultado:", arguments);
                    if (error) return console.error(error);                    
                    deferred.resolve(url);
                });
            } else {
                console.log("este Node no ha sido fetcheado todavía", [this, node]);
            }
        });        
        return deferred.promise();        
    }
    
    DropBox.prototype.thumbnail = function () {  }        
    
    return DropBox;
});