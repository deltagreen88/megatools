/**
 * MegaAPI
 *
 * This object consist mostly of remote API call helpers that can be
 * used to perform various operations on user session:
 *
 * - create ephemeral account
 * - upgrade it to full user account
 * - confirm user account from email activation link
 * - get user account information
 * - update user account information
 *
 * API is asynchronous and uses Defer object to provide easy way to work
 * with asynchronous API calls.
 *
 * MegaAPI is not state-less. It's state is stored in sid and callId
 * properties.
 *
 * You can use arbitrary number of independent MegaAPI instances. (if
 * you want to work with two sessions at once for example)
 *
 * API Calls
 * ---------
 *
 * API calls use naming convention for parameters and return values:
 *
 *   mk           - plain master key buffer
 *   emk          - encrypted master key buffer
 *   pk           - password key buffer
 *   password     - plain password string
 *   uh           - user handle
 *   sid          - session id
 *   user         - raw user object returned by the server (a:ug)
 *   email        - user's email address string
 *   name         - real user name string
 *   rsa          - rsa key pair {privk, pubk}
 *   privk        - rsa encrypted private key
 *   pubk         - rsa public key
 *
 * API call methods may receive multiple parameters and always return
 * one object with properties named as show above.
 *
 * Fail callbacks get passed error code and error message parameters.
 * Error code string is meant for machine processing, message is to be
 * understood by humans.
 *
 * List of error codes used by MegaAPI:
 *
 *   EINTERNAL EARGS EAGAIN ERATELIMIT EFAILED ETOOMANY ERANGE EEXPIRED
 *   ENOENT ECIRCULAR EACCESS EEXIST EINCOMPLETE EKEY ESID EBLOCKED
 *   EOVERQUOTA ETEMPUNAVAIL ETOOMANYCONNECTIONS EWRITE EREAD EAPPKEY 
 *
 * API Call Methods Summary
 * ------------------------
 *
 * Raw API calls:
 *
 *   call(request[])       done(result[])
 *   callSingle(request)   done(result) 
 *
 * Note that call() may return error codes in the results array instead
 * of the true return value (meaning you have to handle those on your
 * own). callSingle() handles these per-request errors behind the scenes
 * and calls the fail() callback with appropriate error code and message.
 *
 * You can implement any mega.co.nz API call with these, but MegaAPI
 * also provides convenience methods to do more complicated things:
 *
 * User account management:
 *
 *   registerEphemeral(password)            done({uh, password, ts, mk, pk}) 
 *   loginEphemeral(uh, password)           done({user, uh, sid, pk, password, mk})
 *   registerUser()                         done({})
 *   verifyUser()                           done({})
 *   login(email, password)                 done({user, uh, sid, pk, password, mk, email})
 *   updateUser(user)                       done({user})
 *   getUser()                              done({user})
 *
 * Methods you'll probably never need:
 *
 *   requestConfirmation()                  done({})
 *   sendConfirmation()                     done({})
 */
GW.define('MegaAPI', 'object', {

	//host: 'eu.api.mega.co.nz',
	host: 'g.api.mega.co.nz',

	// {{{ errorMessages, errorCodes

	errorMessages: {
		EINTERNAL           : "Internal error",
		EARGS               : "Invalid argument",
		EAGAIN              : "Request failed, retrying",
		ERATELIMIT          : "Rate limit exceeded",
		EFAILED             : "Transfer failed",
		ETOOMANY            : "Too many concurrent connections or transfers",
		ERANGE              : "Out of range",
		EEXPIRED            : "Expired",
		ENOENT              : "Not found",
		ECIRCULAR           : "Circular linkage detected",
		EACCESS             : "Access denied",
		EEXIST              : "Already exists",
		EINCOMPLETE         : "Incomplete",
		EKEY                : "Invalid key/integrity check failed",
		ESID                : "Bad session ID",
		EBLOCKED            : "Blocked",
		EOVERQUOTA          : "Over quota",
		ETEMPUNAVAIL        : "Temporarily not available",
		ETOOMANYCONNECTIONS : "Connection overflow",
		EWRITE              : "Write error",
		EREAD               : "Read error",
		EAPPKEY             : "Invalid application key"
	},

	errorCodes: {
		EINTERNAL           : -1,
		EARGS               : -2,
		EAGAIN              : -3,
		ERATELIMIT          : -4,
		EFAILED             : -5,
		ETOOMANY            : -6,
		ERANGE              : -7,
		EEXPIRED            : -8,
		ENOENT              : -9,
		ECIRCULAR           : -10,
		EACCESS             : -11,
		EEXIST              : -12,
		EINCOMPLETE         : -13,
		EKEY                : -14,
		ESID                : -15,
		EBLOCKED            : -16,
		EOVERQUOTA          : -17,
		ETEMPUNAVAIL        : -18,
		ETOOMANYCONNECTIONS : -19,
		EWRITE              : -20,
		EREAD               : -21,
		EAPPKEY             : -22
	},

	getErrorName: function(num) {
		var key;
		for (key in this.errorCodes) {
			if (this.errorCodes[key] == num) {
				return key;
			}
		}

		return 'EUNKNOWN';
	},

	getErrorMessage: function(name) {
		return this.errorMessages[name] || 'Unknown error';
	},

	// }}}
	// {{{ state

	sid: null,
	sidParamName: null,
	callId: 0,

	setSessionId: function(sid, paramName) {
		this.sid = sid;
		this.sidParamName = paramName;
	},

	// }}}
        // {{{ call

	call: function(requests) {
		var me = this;

		return Defer.defer(function(defer) {
			me.callId++;

			var url = ['https://', me.host, '/cs?id=', me.callId, (me.sid ? ['&', me.sidParamName ? me.sidParamName : 'sid', '=', me.sid].join('') : '')].join('');
			var jsonReq = JSON.stringify(requests);
			var nextTimeout = 10000;

			Log.debug('API CALL', me.callId, 'POST ' + url);
			Log.debug('API CALL', me.callId, '<- ' + Duktape.enc('jx', requests, null, '    '));

			function doRequest() {
				C.http({
					method: 'POST',
					url: url,
					data: jsonReq,
					headers: {
						'Content-Type': 'application/json',
						'User-Agent': 'Megatools 2.0',
						'Referer': 'https://mega.co.nz/'
					},
					onload: function(data) {
						var response = JSON.parse(data);

						Log.debug('API CALL', me.callId, '-> ' + Duktape.enc('jx', response, null, '    '));

						if (_.isNumber(response)) {
							var code = me.getErrorName(response);

							defer.reject(code, me.getErrorMessage(code));
						} else if (_.isArray(response)) {
							defer.resolve(response);
						} else {
							defer.reject('empty');
						}
					},
					onerror: function(code, msg) {
						if (code == 'busy' || code == 'no_response') {
							Log.debug('API CALL RETRY', me.callId);

							if (nextTimeout < 120 * 1000 * 1000) {
								// repeat our request
								C.timeout(function() {
									doRequest();
								}, nextTimeout);

								nextTimeout *= 2;
							}
						} else {
							defer.reject(code, msg);
						}
					}
				});
			}

			doRequest();
		});
	},

	// }}}
	// {{{ callSingle

	callSingle: function(request) {
		return Defer.defer(function(defer) {
			this.call([request]).then(function(responses) {
				if (_.isNumber(responses[0]) && responses[0] < 0) {
					var code = this.getErrorName(responses[0]);

					defer.reject(code, this.getErrorMessage(code));
				} else {
					defer.resolve(responses[0]);
				}
			}, defer.reject, this);
		}, this);
	},

	// }}}
	// {{{ registerEphemeral

	/**
	 * Create ephemeral account
	 *
	 * Returns user handle string.
	 */
	registerEphemeral: function(password) {
		var pk = C.aes_key_from_password(password);
		var mk = C.aes_key_random();
		var emk = C.aes_enc(pk, mk);

		var ts1 = C.random(16);
		var ts2 = C.aes_enc(mk, ts1);
		var ts = C.joinbuf(ts1, ts2);

		return Defer.defer(function(defer) {
			this.callSingle({
				a: 'up',
				k: C.ub64enc(emk),
				ts: C.ub64enc(ts)
			}).then(function(uh) {
				defer.resolve({
					uh: uh,
					password: password,
					ts: ts,
					mk: mk,
					pk: pk
				});
			}, defer.reject);
		}, this);
	},

	// }}}
	// {{{ loginEphemeral

	/**
	 * Login to ephemeral account
	 *
	 * Returns user object from mega and master key.
	 */
	loginEphemeral: function(uh, password) {
		return Defer.defer(function(defer) {
			this.callSingle({
				a: 'us',
				user: uh
			}).then(function(res) {
				var pk = C.aes_key_from_password(password);
				var emk = C.ub64dec(res.k);
				var mk = C.aes_dec(pk, emk);
				var tsid = C.ub64dec(res.tsid);

				if (tsid.length < 32) {
					defer.reject('invalid_tsid_len', 'tsid too short');
					return;
				}

				var ts1 = C.slicebuf(tsid, 0, 16);
				var ts2 = C.slicebuf(tsid, tsid.length - 16, 16);
				var ts2ok = C.aes_enc(mk, ts1);

				if (ts2 != ts2ok) {
					defer.reject('invalid_tsid', 'tsid was not verified');
					return;
				}

				this.setSessionId(res.tsid);

				defer.resolve({
					uh: uh,
					sid: res.tsid,
					password: password,
					pk: pk,
					mk: mk
				});
			}, defer.reject, this);
		}, this);
	},

	// }}}
	// {{{ login

	/**
	 * Login to normal account.
	 */
	login: function(email, password) {
		return Defer.defer(function(defer) {
			var pk = C.aes_key_from_password(password);

			this.callSingle({
				a: 'us',
				uh: C.make_username_hash(pk, email),
				user: email.toLowerCase()
			}).then(function(res) {
                                // decrypt mk
				var emk = C.ub64dec(res.k);
				var mk = C.aes_dec(pk, emk);

				// get rsa
				var sid = C.rsa_decrypt_sid(res.privk, mk, res.csid);
				if (!sid) {
					defer.reject('sid_decrypt_fail', 'Can\'t decrypt SID');
					return;
				}

				this.setSessionId(sid);

				defer.resolve({
					uh: res.u,
					sid: sid,
					email: email,
					password: password,
					pk: pk,
					mk: mk
				});
			}, defer.reject, this);
		}, this);
	},

	// }}}
	// {{{ getUser

	getUser: function() {
		return this.callSingle({
			a: 'ug'
		}).done(function(user) {
			this.setArgs({
				user: user
			});
		});
	},

	// }}}
	// {{{ updateUser

	/**
	 * Update user name
	 *
	 * Returns user handle
	 */
	updateUser: function(data) {
		return this.callSingle(_.extend({
			a: 'up'
		}, data)).done(function(uh) {
			this.setArgs({
				uh: uh
			});
		});
	},

	// }}}

	zeroBuf: function(len) {
		var buf = Duktape.Buffer(len);
		for (var i = 0; i < len; i++) {
			buf[i] = 0;
		}
		return buf;
	},

	/**
	 * Request confirmation email to be sent by the server to specified email address.
	 */
	requestConfirmation: function(password, mk, name, email) {
		var pk = C.aes_key_from_password(password);
		var c_data = C.aes_enc(pk, C.joinbuf(mk, C.random(4), this.zeroBuf(8), C.random(4)));

		return this.callSingle({
			a: 'uc',
			c: C.ub64enc(c_data),
			n: C.ub64enc(Duktape.Buffer(name)),
			m: C.ub64enc(Duktape.Buffer(email))
		}).done(function(data) {
			this.setArgs({
				data: data,
				password: password,
				mk: mk,
				name: name,
				email: email,
				c_data: c_data
			});
		});
	},

	/**
	 * Send confirmation code from the confirmation email to the server.
	 *
	 * Confirmation link: https://mega.co.nz/#confirmZOB7VJrNXFvCzyZBIcdWhr5l4dJatrWpEjEpAmH17ieRRWFjWAUAtSqaVQ_TQKltZWdvdXNAZW1haWwuY3oJQm9iIEJyb3duMhVh8n67rBg
	 *
	 * Code: ZOB7VJrNXFvCzyZBIcdWhr5l4dJatrWpEjEpAmH17ieRRWFjWAUAtSqaVQ_TQKltZWdvdXNAZW1haWwuY3oJQm9iIEJyb3duMhVh8n67rBg
	 */
	sendConfirmation: function(code) {
		return this.callSingle({
			a: 'ud',
			c: code
		}).done(function(res) {
			this.setArgs({
				email: C.ub64dec(res[0]).toString(),
				name: C.ub64dec(res[1]).toString(),
				uh: res[2],
				emk: C.ub64dec(res[3]),
				challenge: C.ub64dec(res[4]) // enc(challenge, pk)
			});
		});
	},

	/**
	 * Register user (full registration)
	 */
	registerUser: function(name, email, password) {
		var me = this;
		var data = {};

		return Defer.defer(function(defer) {
			Defer.chain([
				function() {
					return me.registerEphemeral(password);
				}, 

				function(res) {
					_.extend(data, res);

					return me.loginEphemeral(data.uh, password);
				}, 

				function(res) {
					_.extend(data, res);

					return me.updateUser({name: name});
				}, 

				function(res) {
                                        _.extend(data, res);

					return me.requestConfirmation(password, data.mk, name, email);
				}
			]).then(function(res) {
				_.extend(data, res);

				defer.resolve(data);
			}, defer.reject);
		});
	},

	verifyUser: function(uh, password, verificationCode) {
		var me = this;
		var data = {};

		return Defer.defer(function(defer) {
			Defer.chain([
				function() {
					return me.loginEphemeral(uh, password);
				}, 

				function(res) {
					_.extend(data, res);

					return me.sendConfirmation(verificationCode);
				}, 

				function(res) {
					_.extend(data, res);

					data.rsa = C.rsa_generate(data.mk);
					return me.updateUser({
						c: verificationCode,
						uh: C.make_username_hash(data.pk, res.email),
						pubk: data.rsa.pubk,
						privk: data.rsa.privk
					});
				}
			]).then(function() {
				defer.resolve({
					mk: data.mk,
					uh: data.uh,
					password: password
				});
			}, defer.reject);
		});
	}
});