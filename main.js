
	//watch out, since this uses jQuery, it is using NONSTANDARD syntax for promises (.fail!!!)

	//ES can do this? learn something every day
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

	var accessToken = "b83accd64dca4baf81b23faebc09f20b";
	var subscriptionKey = "b5f21b33-b598-4cfc-b458-6804a4b58133";
	var baseUrl = "https://api.api.ai/v1/";
	var recognition; //global speech recognition API

	// Even if I'm not using React, I'm not storing state in the fucking DOM
	var state = {
		useApiAi: true,
		regexCheck: [{
			action: 'request.phone',
			test: new RegExp(/(phone|phpne|phonw|hpone|call him|text message|his cell|her cell|their cell|his number|her number|their number)/i)
		},
		{
			action: 'request.email',
			test: new RegExp(/(email|emial|emaik)/i)
		},
		{
			action: 'shutup',
			test: new RegExp(/(shut up|shutup|be quiet|stop talking)/i)
		},
		{
			action: 'request.website',
			test: new RegExp(/(website|webiste|his site|her site|url)/i)
		}],
		shouldSpeak: true,
		isAwaiting: false,
		awaiting: '',
		conversation: {
			callback: function(){return;},
			params: [],
			who: 'user/cvBot/neutral',
			postCallback: function(){return 'Sam is an asshole';}
		},
		resume: {},
		shortName: '',
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

	function loadResume(url) {
		return $.get(url);
	}

	function startRecognition() {
		if (!('webkitSpeechRecognition' in window)) {
		  alert('Sorry, speech recognition is not available on your browser :( \n You\'ll have to type your queries.');
		} else {
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

		// remove tags from text
		text = text.replace(/(<([^>]+)>)/ig,'').replace(/(http:\/\/)/ig,'');
		// Set the text
		msg.text = text;

	  // Set the attributes.
		msg.volume = 1; //max is 1
		msg.rate = 1.1; //max is 10 - anything above 2 is absurd
		msg.pitch = 1; //max is 2

		//see https://developers.google.com/web/updates/2014/01/Web-apps-that-talk-Introduction-to-the-Speech-Synthesis-API?hl=en
		msg.voice = speechSynthesis.getVoices().filter(function(voice) { return voice.name == 'Google US English'; })[0];

	  // Queue this utterance.
		window.speechSynthesis.speak(msg);
	}

	function toggleSpeech() {
		window.state.shouldSpeak = false;
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

	//this should fucking work
	function localCheck(text) {
		var tested = window.state.regexCheck.map(function(el) {
			return {
				action: el.action,
				validity: el.test.test(text)
			};
		});
		var passed = tested.filter( el => el.validity === true )[0];
		if(passed) {
			var response = {};
			response.result = {};
			response.result.action = passed.action;
			return response;
		}
		return false;
	}

	function parseRequest(text) {
		if(window.state.useApiAi) {
			// any Regex tests come first to short circuit
			var simpleSearch = localCheck(text);
			if (simpleSearch !== false) {
				return new Promise(function(resolve, reject) {
					setTimeout(function() {
						resolve(simpleSearch);
					}, 600);//slow it down, mr eager
				});
			} else {
				// no regex matches, so send out
				return sendToApiAi(text);
			}
		} else {
			// bs for testing
			return new Promise(function(resolve, reject) {
				resolve({
					result: {
						action: 'request.image'
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
		var message = {};
		message.type = actionName;
		message.speak = [];

		//this is a hack - should come from resume.json
		if(actionName === 'request.image') {
			message.data = {url: 'http://www.samuelhavens.com/me.jpg'};

		} else if(actionName === 'social.network') {
			//getSocialNetwork returns obj w name, url and username or false
			var network = getSocialNetwork(params.network);
			var name = window.state.shortName;

			var says = network
					? 'You can find ' + name + ' on ' + network.network + ' as <a href="' + network.url + '">' + network.username + '</a>'
					: name + ' did not list that network on their resume.json file';

			message.speak = [{user: 'cvBot', says: says}];

		} else if(actionName === 'request.degree') {
			var school;
			if (params.degree && params.degree !== 'graduate') {
				//they asked for bachelors, masters, or phd by name or synonym theirof
				var degreeType = params.degree;
				//this disaster checks if they have an education section listing that degree type (using string contains)
				// the ~ is just a trick to make indexOf return something truthy
				school = window.state.resume.education.filter( el => ~_.lowerCase(el.studyType).indexOf(_.lowerCase(degreeType)));
			} else if (params.degree && params.degree === 'graduate') {
				//they were vague about degree
				var masterTest = new RegExp(/^(master)/i);
				var phdTest = new RegExp(/^(ph|doctor)/i);
				//check for phd, if not found, then check for masters
				school = window.state.resume.education.filter( el => phdTest.test(el.studyType) );
				if (!school.length) {
					school = window.state.resume.education.filter( el => masterTest.test(el.studyType) );
				}
			} else {
				//they asked about degrees but didn't specify type... hit 'em with 'em all
				school = window.state.resume.education
			}
			message.speak = schoolChecker(school);

		} else if (actionName === 'request.accolade') {

			if (params.accolade === 'award') {
				message.speak = listAwards();
			} else if (params.accolade === 'publication') {
				message.speak = listPublications();
			} else {
				//it was unclear, request clarification
				var toSay = response.result.speech;
				message.speak.push({user:'cvBot', says: toSay});
			}

		} else if (actionName === 'request.language') {
			var language = params.language;
			message.speak = doesSpeak(language);
		} else if (actionName === 'request.phone') {
			message.speak = [{user:'cvBot', says: givePhone()}];

		} else if (actionName === 'request.email') {
			message.speak = [{user:'cvBot', says: giveEmail()}];

		} else if (actionName === 'request.website') {
			message.speak = [{user:'cvBot', says: giveWebsite()}];

		} else if (actionName === 'request.location') {
			message.speak = [{user:'cvBot', says: giveLocation()}];

		} else if (actionName === 'shutup') {
			toggleSpeech();
			message.speak = [{user:'cvBot', says:'Okay, I will stop reading messages aloud. It\'s kind of a gimmick anyway.'}];

		} else if (actionName === 'name.save') {
			window.state.user.name = params.name;
			message.speak = [{user:'cvBot', says:'Hello, ' + params.name}];

		} else if (actionName === 'name.get') {
			if (window.state.user.name) {
					message.speak = [{user:'cvBot', says:'Your name is ' + window.state.user.name}];
			} else {
				message.speak = [{user:'cvBot', says:'I don\'t know your name'}];
			}
		} else if ( (new RegExp(/(smalltalk|unknown)/i)).test(actionName) ) {
			//they are just bullshiting, get them on track
			var toSay = response.result.speech || iDontKnow();
			var name = sampleName();
			var prod = sampleProd();
			message.speak = [{user:'cvBot', says: toSay }];
			message.speak.push({user:'cvBot', says: prod + name});
		} else {
			// who knows how they got here, but say something just in case
			var toSay = response.result.speech || iDontKnow();
			message.speak = [{user:'cvBot', says: toSay }];
		}
		return message;
	}

	// takes a formatted api response and outputs an object based on reponse.types
	// {speak: [{user:'cvBot', says:''},...], html:[''], data: [], prompt: {everything from state.conversation}} or something
	// WARNING OUTPUT.SPEAK AND .HTML TAKE ARRAYS! SO THAT MULTIPLE THINGS CAN BE SAID
	function generateNewMessage(response) {
		var output = {};

		if (response.type === 'request.image') {
			output.speak = [{user:'cvBot', says:'Here\'s the handsome devil'}];
			output.html = ['<img class="look-at-me" src="' + response.data.url + '"/>'];
		} else {
			output.speak = response.speak;
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
			console.log(output);
			// actually answer
			if(output.speak)
				output.speak.forEach( (el) => says(el.user, el.says) );
			if(output.html)
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

	function givePhone() {
		var name = sampleName();
		var phone = window.state.resume.basics.phone;
		var phoneStripped = phone.replace(/[^0-9]/g,"");
		return callToAction(name, 'call') + ' <a href="tel:' + phoneStripped + '">' + phone + '</a>';
	}

	function giveEmail() {
		var name = sampleName();
		var email = window.state.resume.basics.email;
		return callToAction(name, 'email') + ' <a href="mailto:' + email + '">' + email + '</a>';
	}

	function giveWebsite() {
		var url = window.state.resume.basics.website;
		return callToAction('their website', 'visit') + ' <a href="' + url + '">' + url + '</a>';
	}

	function giveLocation() {
		var name = sampleName();
		var city = window.state.resume.basics.location.city;
		var state = window.state.resume.basics.location.region;
		return _.sample([
			'Currently, ' + name + ' resides in ' + city + ', ' + state,
			name + ' calls ' + city + ', ' + state + ' home, for now',
			name + ' lives in ' + city + ', ' + state
		]);
	}

	function publicationSampler(publication) {
		var name = sampleName();
		var option = [
			'On ' + readableDate(publication.releaseDate) + ', ' + name + ' published <a href="' + publication.website + '">' + publication.name + '</a> with ' + publication.publisher + '.',
			name + ' published <a href="' + publication.website + '">' + publication.name + '</a> on ' + readableDate(publication.releaseDate) + ' through ' + publication.publisher + '.'
		]
		return _.sample(option);
	}

	function awardSampler(award) {
		var name = sampleName();
		var option = [
			'On ' + readableDate(award.date) + ', ' + name + ' was awarded the ' + award.title + ' award.',
			name + ' was awarded the ' + award.title + ' award on ' + readableDate(award.date)
		]
		return _.sample(option);
	}

	function listPublications() {
		var output = [];
		window.state.resume.publications.forEach(function(publication) {
			var msg = {};
			msg.user = 'cvBot';
			msg.says = publicationSampler(publication);
			output.push(msg);
		});
		return output;
	}

	function listAwards() {
		var output = [];
		window.state.resume.awards.forEach(function(award) {
			var msg = {};
			msg.user = 'cvBot';
			msg.says = awardSampler(award);
			output.push(msg);
		});
		return output;
	}

	function doesSpeak(language) {
		var output = [];
		var msg = {};
		var name = sampleName();
		msg.user = 'cvBot';
		var speaks = window.state.resume.languages.filter(function(el) {
			console.log(el,language);
			return _.toLower(el.language) === _.toLower(language);
		});
		console.log(speaks);
		if (speaks.length) {
			msg.says = name + ' rates their fluency at ' + speaks[0].language + ' as: "' + speaks[0].fluency + '"';
		} else {
			msg.says = startSentence() + ' no.';
		}
		msg.says = _.upperFirst(_.trim(msg.says));
		output.push(msg);
		return output;
	}

	// used in processing actionName = request.degree
	// checks if there were any matching schools
	// if so, iterate through them and add a message to speak about them
	function schoolChecker(school) {
		var name = window.state.shortName;
		var speak = [];
		if (school.length) {
			school.forEach(function(inst) {
				speak.push({user: 'cvBot', says: startSentence() + name + ' attended ' + inst.institution + ' pursuing a ' + inst.studyType + ' in ' + inst.area + '.'});
				if (inst.endDate) {
					var dateReadable = readableDate(inst.endDate);
					speak.push({user: 'cvBot', says: name +' earned that degree on ' + dateReadable + ' with a GPA of ' + inst.gpa});
				}
			});
		} else {
			speak = [{user: 'cvBot', says: name + ' does not appear to have that degree.'}];
		}
		return speak;
	}

	function readableDate(yyyyMmDd) {
		var dateObject = new Date(Date.parse(yyyyMmDd));
		return dateObject.toDateString();
	}

	function getSocialNetwork(name) {
		var network = window.state.resume.basics.profiles.filter( el => el.network == name );
		return network.length > 0 && network[0];
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
		setTimeout(function() {
			//add new stuff
			addToHistory(output);
			if(window.state.shouldSpeak){
				speak(msg);
			}
		}, wait);
		//wait a tad, then animate in the img DOM nodes you made
		setTimeout(function(){$('.cl-media').fadeIn(400);}, wait+60)
	}

	function addToTranscript(user, message) {
		console.log(user, message);
		if (message && ~message.indexOf('class="thinking"')) return;
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

	function startSentence() {
		var option = [
			'Well, ',
			'',
			'',
			'It seems ',
			'It looks like ',
			'I\'m seeing that ',
			''
		];
		return _.sample(option);
	}

	function sampleProd() {
		var option = [
			'Why don\'t you ask me about ',
			'Maybe we could switch gears to ',
			'I only have eyes for ',
			'Hey! You know what\'s really cool? Talking about ',
			'Let\'s transition back to '
		];
		return _.sample(option);
	}

	function sampleName() {
		var short = window.state.shortName;
		var name = window.state.resume.basics.name;
		var option = [
			short,
			name
		];
		return _.sample(option);
	}

	function callToAction(name, action) {
		var phrasing = [
			'You should ' + action + ' ' + name + ' now at',
			'You should ' + action + ' ' + name + ' now at',
			'Why don\'t you ' + action + ' ' + name + ' now? ',
			'Why don\'t you ' + action + ' ' + name + ' now? ',
			'Now is probably a good time to ' + action + ' ' + name + '.',
			'"You may delay, but time will not." ' + _.upperFirst(action) + ' ' + name + ' now:'
		];
		return _.sample(phrasing);
	}

	function isYes(phrase) {
		return (new RegExp(/^(yes|yea|yup|yep|ya|sure|ok|y|yeah|yah)/i).test(phrase));
	}

	function dotproduct(a,b) {
	 var n = 0, lim = Math.min(a.length,b.length);
	 for (var i = 0; i < lim; i++) n += a[i] * b[i];
	 return n;
	}

	function onResumeLoad(resume) {
		window.state.resume = resume;
		var name = resume.basics.name;
		window.state.shortName = name.split(' ')[0];
		var shortName = window.state.shortName;
		$('#input').attr('placeholder', 'Let\'s talk about ' + name);
		says('cvBot', 'I\'ve loaded the résumé of, and am ready to talk about, '+name+'!');
		says('cvBot', 'For example, did you know that ' + name + ' is a ' + resume.basics.label+'?');
		says('cvBot', 'Just ask me questions about ' + shortName + ' and I will do my best to answer them.');
	}

	//on page load, do some binding and talk to the user.
	$(document).ready(function() {
		//event binding
		$("#input").keypress(handleTextInput);
		$("#rec").click(handlePressRecord);
		says('cvBot','Hello, my name is CV Bot', 200);//give the voice time to load
		loadResume('http://www.samuelhavens.com/resume.json').then(onResumeLoad);
	});
