
	//watch out, since this uses jQuery, it is using NONSTANDARD syntax for promises (.fail!!!)

	var moneyFormatter = new Intl.NumberFormat('en-US', {
	  style: 'currency',
	  currency: 'USD',
	  maximumFractionDigits: 0,
	});

	//this is magic
	function getOrdinal(n) {
		var s=["th","st","nd","rd"],
	      v=n%100;
	   return n+(s[(v-20)%10]||s[v]||s[0]);
	}

	//load all voices
	(function(window){
		window.speechSynthesis.getVoices()
	}(window));

	//api.ai stuff
	var accessToken = "b83accd64dca4baf81b23faebc09f20b";
	var subscriptionKey = "b5f21b33-b598-4cfc-b458-6804a4b58133";
	var baseUrl = "https://api.api.ai/v1/";
	var recognition; //global speech recognition API

	var state = {
		useApiAi: false,
		shouldSpeak: true,
		isAwaiting: false,
		awaiting: '',
		conversation: {
			callback: function(){return;},
			params: [],
			who: 'user/cvBot/neutral',
			postCallback: function(){return 'Sam is an asshole';}
		},
		currentSection: {
			name: '',
			id: ''
		},
		user: {
			name: '',
			preferences: []
		},
		transcript: []
	};



	function startRecognition() {
		recognition = new webkitSpeechRecognition();
		recognition.onstart = function(event) {
			//updateRec();
			$("#rec").addClass('recording')
		};
		recognition.onresult = function(event) {
			var text = "";
		    for (var i = event.resultIndex; i < event.results.length; ++i) {
		    	text += event.results[i][0].transcript;
		    }
			stopRecognition();
			answerQuestion(text);
		};
		recognition.onend = function() {
			stopRecognition();
		};
		recognition.lang = "en-US";
		recognition.start();
	}

	function stopRecognition() {
		if (recognition) {
			recognition.stop();
			recognition = null;
		}
		//updateRec();
		$("#rec").removeClass('recording');
	}

	function switchRecognition() {
		if (recognition) {
			stopRecognition();
		} else {
			startRecognition();
		}
	}

	function speak(text) {
	  // Create a new instance of SpeechSynthesisUtterance.
		var msg = new SpeechSynthesisUtterance();

	  // Set the text.
		msg.text = text;

	  // Set the attributes.
		msg.volume = 1; //max is 1
		msg.rate = 1; //max is 10 - anything above 2 is absurd
		msg.pitch = 1; //max is 2

		//see https://developers.google.com/web/updates/2014/01/Web-apps-that-talk-Introduction-to-the-Speech-Synthesis-API?hl=en
		msg.voice = speechSynthesis.getVoices().filter(function(voice) { return voice.name == 'Google US English'; })[0];

	  // Queue this utterance.
		window.speechSynthesis.speak(msg);
	}

	function toggleSpeech() {
		window.state.shouldSpeak = !window.state.shouldSpeak;
	}


	function sendToApiAi(text) {
		return $.ajax({
			type: "POST",
			url: baseUrl + "query/",
			contentType: "application/json; charset=utf-8",
			dataType: "json",
			headers: {
				"Authorization": "Bearer " + accessToken,
				"ocp-apim-subscription-key": subscriptionKey
			},
			data: JSON.stringify({ q: text, lang: "en" }),
		});
	}

	function parseRequest(text) {
		if(window.state.useApiAi) {
			return sendToApiAi(text)
		} else {
			return new Promise(function(resolve, reject) {
				resolve({
					result: {
						action: 'request.image',
						parameters: {
							name: 'Soul'
						}
					}
				});
			});
		}
	}

	function formatParsed(resp) {
		var action = resp.result.action;
		var params = resp.result.parameters;
		return Object.assign({}, resp, {action: action, params: params});
	}


	//really should call if not in cache
	//then get from cache
	//I should MEMOIZE this, if you will
	// also this should return a STANDARDIZED OBJECT, eg {say: "", html:""} or something
	function actionHandler(response) {
		var actionName = response.action;
		var params = response.params;

		if(actionName === 'request.image') {
			return {
					imgData: {url: 'http://www.samuelhavens.com/me.jpg'},
					type: actionName
				};
		}//end request.image

		if(actionName === 'request.better') {
			var modelNameArray = getModelNameArray(params);
			return betterCar(modelNameArray);
		}

		if(actionName === 'compare.overall') {
			var modelNameArray = getModelNameArray(params);
			return compareOverall(modelNameArray);
		}

		if(actionName === 'compare.attribute') {
			var modelNameArray = getModelNameArray(params);
			return whichIsMost(params.attribute, modelNameArray ).then(function(ans) {
				return {type: actionName, speak: {user:'cvBot', says:'The ' + ans}};
			});
		}

		if (actionName === 'name.save') {
			window.state.user.name = params.name;
			return {type: actionName, speak: {user:'cvBot', says:'Hello, ' + params.name}}
		}

		if (actionName === 'name.get') {
			if (window.state.user.name) {
					return {type: actionName, speak: {user:'cvBot', says:'Your name is ' + window.state.user.name}}
			} else {
				return {type: actionName, speak: {user:'cvBot', says:'I don\'t know your name'}}
			}
		}

		return Object.assign({}, response, {speak: {user:'cvBot', says:response.result.speech}});
	}

	// takes a formatted api response and outputs HTML
	// all reponse.types should be in the same format:
	// {speak: [{user:'cvBot', says:''},...], html:[''], data: [], prompt: {everything from state.conversation}} or something
	// or maybe that's what should be returned...
	function generateNewMessage(response) {
		// console.log(response);
		var output = {};
		//NOTE: OUTPUT.SPEAK AND .HTML TAKE ARRAYS! SO THAT MULTIPLE THINGS CAN BE SAID
		if (response.type === 'request.image') {
			//say something - you got pics, so the name worked
			output.speak = [{user:'cvBot', says:'Here\'s the handsome devil'}];
			output.html = ['<img style="width:70%" src="http://www.samuelhavens.com/me.jpg"/>'];
		} else {
			output.speak = [{user:'cvBot', says:response.speak}];
		}
		return output;
	}

	//the MAIN FUNCTION
	function answerQuestion(query) {
		says('user',query);
		//say something right away to acknowledge
		says('cvBot',bullshitFiller());
		// it is possible that the user didn't pose a question, but instead was
		// answering a question posed by cvBot. In that case, deal with the answer, then
		// break of the whole chain by returning
		if(window.state.isAwaiting === true){
			handleUserAnswer(query);
			return;
		}
		parseRequest(query).then(function(data) {
		return formatParsed(data);

		}).then(function(formatted) {

			return actionHandler(formatted)

		}).then(function (response) {

			return generateNewMessage(response);

		}).then(function(output) {
			// actually answer
			// this should be a function, addToHistory(message, user, delay)
			// that way there is no bullshit addToUserHistory, addToCvBotHistory, etc
			// and generateNewMessage can actually return in all cases instead of programming by side effects
			output.speak.forEach( (el) => says(el.user, el.says) );
			output.html.forEach( (el) => addToHistory(el) );

		});
	}

	// this function would be better if the switch statement always gave some output,
	// OTF {cvBot: '', user: '', html: ''}, which could be
	// returned and rendered appropriately
	// for now though, it actually mutates the DOM and is not DRY
	// setting isAwaiting over and over is incase we want to repeat the question...
	function handleUserAnswer(answer) {
		switch (window.state.awaiting) {
			case 'confirmation':
				if(isYes(answer)) {
					var convo = window.state.conversation;
					if (convo.who === 'nuetral') {
						addToHistory(convo.callback.apply(null, convo.params));
					} else if (convo.who === 'cvBot') {
						says('cvBot',convo.callback.apply(null, convo.params));
					}
					convo.postCallback();
				} else {
					says('cvBot',cvBotAgrees());
					window.state.isAwaiting = false;
					answerQuestion(answer);
				}
				break;
			case 'zip':
				var zip = getZip(answer); //either the extracted zip or false
				if(zip) {
					addToHistory(convo.callback(zip));
					window.state.isAwaiting = false;
				} else {
					says('cvBot',iDontKnow());
					window.state.isAwaiting = false;
				}
				break;

			default:
				window.state.isAwaiting = false;
				says('cvBot',cvBotAgrees());
		}
		setTimeout(function(){
			//uhhh I hate manipulating the DOM. When I rewrite this in react,
			//it will just look at the state and see if it is thinking
			$('.loading').parent().parent().slideUp(400);
		}, 60)
	}

	function setCurrentSection(section) {
		window.state.currentSection.name = section.name;
		window.state.currentSection.id = section.id;
	}

	function getCurrentSection() {
		return window.state.currentSection;
	}


	function addToHistory(message) {
		//get rid of previous loading messages
		$('.loading').parent().parent().slideUp(400);

		//$('#put-here').prepend(message);
		// messages added to the bottom
		$('#put-here').append(message);

		// scroll up
		$(".chat").animate({
		  scrollTop: $('.chat').prop("scrollHeight")
		}, {
		  duration: 1000,
		  easing: "swing"
		});
	}

	function addToUserHistory(text) {

		addToHistory('<div class="msg user"><div class="meta">You</div><div class="text">' + text + '</div></div>');
	}

	function addToCvBotHistory(msg, wait) {
		if (msg.length === 0) return;

		var wait = typeof wait !== 'undefined' ? wait : 0;
		var output = '<div class="msg cvBot"><div class="meta">CV Bot</div><div class="text">' + msg + '</div></div>';
		//check if it is html or plaintext
		var isHTML = /<[a-z][\s\S]*>/i.test(msg);

		setTimeout(function() {
			//add new stuff
			addToHistory(output);
			if(!isHTML) {
				if(window.state.shouldSpeak){
					speak(msg);
				}
			}
		}, wait);
		//wait a tad, then animate in the img DOM nodes you made
		setTimeout(function(){$('.cl-media').fadeIn(400);}, wait+60)
	}

	function addToTranscript(user, message) {
		// console.log(user, message);
		if (~message.indexOf('class="thinking"')) return;
		window.state.transcript.push({
			user: user,
			message: message
		});
		//send to server?
	}

	//side effect: adds to transcript, adds to convo history
	function says(user, message) {
		addToTranscript(user, message);
		if(user==="cvBot") {
			addToCvBotHistory(message);
		} else if (user==="user") {
			addToUserHistory(message);
		}
	}

	function handleTextInput(event) {
		if (event.which == 13) {
			event.preventDefault();
			var text = $("#input").val();
			answerQuestion(text);
			$('#input').val('');//clear input once you it enter
		}
	}

	function handlePressRecord(event) {
		switchRecognition();
	}

	// The repeats are to raise the odds of getting those responses

	function bullshitFiller() {
		return '<div class="loading"><span></span></div>';
	}

	function iDontKnow() {
		var option = [
			'I don\'t seem to have anything on that',
			'I\'m not sure I understood that question',
			'Could you repeat that?',
			'I don\'t seem to have anything on that',
			'I\'m not sure I understood that question',
			'Could you repeat that?',
			'Well, it looks like you stumped me! You win!',
			'Sorry, I don\'t seem to have that information...yet!'
		];
		return _.sample(option);
	}

	function cvBotAgrees() {
		var option = [
			'Alright',
			'Alright then',
			'Very well',
			'Ok'
		];
		return _.sample(option);
	}

	function isYes(phrase) {
		return (new RegExp(/^(yes|yea|yup|yep|ya|sure|ok|y|yeah|yah)/i).test(phrase));
	}

	function dotproduct(a,b) {
	 var n = 0, lim = Math.min(a.length,b.length);
	 for (var i = 0; i < lim; i++) n += a[i] * b[i];
	 return n;
	}

	//on page load, do some binding and talk to the user.
	$(document).ready(function() {
		//event binding
		$("#input").keypress(handleTextInput);
		$("#rec").click(handlePressRecord);
		says('cvBot','Hello, my name is CV Bot', 200);//give the voice time to load
		says('cvBot','I\'m here to answer questions about a résumé. Give me a moment to load it...', 1200);

	});
