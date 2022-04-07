/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */
/*
  Copyright (c) 2011-2012, Giovanni Campagna <scampa.giovanni@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:
    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
    * Neither the name of the GNOME nor the
      names of its contributors may be used to endorse or promote products
      derived from this software without specific prior written permission.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
  ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
  DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
  SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
const GIRepository = imports.gi.GIRepository;
GIRepository.Repository.prepend_search_path("/usr/lib/gnome-shell");
GIRepository.Repository.prepend_library_path("/usr/lib/gnome-shell");
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

const ExtensionUtils = imports.misc.extensionUtils;

function getSchemaData(schema) {
    const Settings = ExtensionUtils.getSettings()
    const schemaObj = Settings["settings_schema"]
    const basicTypes = ["b", "y", "n", "q", "i", "u", "x", "t", "h", "d", "s", "o", "g", "?"].map(function(type){return {type: type, vt :  new GLib.VariantType(type)}});
    const allKeys = schemaObj.list_keys().map(function(keyName) {
	    const key = schemaObj.get_key(keyName);
	    const keyType = key.get_value_type();
	    const keyTypeFound = basicTypes.find(bt=>keyType.equal(bt.vt));
	    if (!keyTypeFound) {return null;}
	    const summary = key.get_summary();
	    const description = key.get_description();
	    const defaultValue = key.get_default_value().unpack();
	    const value = Settings.get_value(keyName).unpack();
	    return {name: keyName, summary: summary, description: description, defaultValue: defaultValue, value: value, type: keyTypeFound.type }

    }).filter(a=>Boolean(a));
    return {basicSchema: allKeys, settings: Settings};
}




