angular
	.module('ttm', [])
	.controller('AggregatorCtrl', function($scope, $timeout, $rootScope, $sce){
		$scope.tabs = [{
            title: 'Settings',
            url: 'settings.tpl.html',
            icon: 'settings',
            id: 'settings'
        }, {
            title: 'Twitts',
            url: 'tweets.tpl.html',
            icon: 'twitter',
            id: 'twitter'
        }, {
            title: 'About',
            url: 'about.tpl.html',
            icon: 'text file',
            id: 'about'
    	}];

    	$scope.currentTab = 'settings';
    	$scope.saving = false;
    	$scope.clients = clients;
    	$scope.client = clients[0];

    	$scope.onTab = function(id){
    		$timeout(function(){
    			$scope.$apply(function(){
    				$scope.currentTab = id;
    			});
    		});
    	}

		$scope.onClick = function(c){
			$timeout(function(){
    			$scope.$apply(function(){
    				$scope.client = c;
    			});
    		});
		}

		$scope.getAbout = function(){
			return $sce.trustAsHtml($scope.client.about);
		}

		$scope.save = function(form){
			if(form.$valid){
				var C = Parse.Object.extend('AGG_config');
				var c = new C({id: $scope.client.objectId});
				var data = {};
				var client = $scope.client;

				switch(form.$name){
				case 'aboutForm':
					data = {about: $scope.client.about}
					break;
				case 'settingsForm':
					data = {
						name: client.name,
						ga_account: client.ga_account,
						page_title: client.page_title,
						page_description: client.page_description,
						account: client.account,
						consumer_key: client.consumer_key,
						consumer_secret: client.consumer_secret,
						consumer_token_key: client.consumer_token_key,
						consumer_token_secret: client.consumer_token_secret,
						instagram_user: client.instagram_user,
						instagram_user_id: client.instagram_user_id,
						instagram_access_token: client.instagram_access_token
					};
					break;
				}
				//Display loader
				$scope.saving = true;
				//Save
				c
					.save(data)
					.then(function(){
						$timeout(function(){
			    			$scope.$apply(function(){
			    				$scope.saving = false;
			    			});
			    		});
					}, function(){
						$timeout(function(){
			    			$scope.$apply(function(){
			    				$scope.saving = false;
			    			});
			    		});
					});
			}
		}
	});