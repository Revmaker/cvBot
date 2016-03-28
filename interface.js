$(document).ready(function(){
	initInterface();
})

function initInterface(){
	$('.clickCatch').click(function(){
		$(this).hide();
		$('.side-menu').removeClass('on');
	})

	$('header .menu').click(function(){
		var target = $('.side-menu');
		if(target.is('.on')){
			target.removeClass('on');
		}
		else{
			target.addClass('on');
			$('.clickCatch').show();
		}
	})
}

