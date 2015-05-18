/*
 * grunt-wp-plugin
 * https://github.com/axisthemes/grunt-wp-plugin
 *
 * Copyright (c) 2014 AxisThemes
 * Licensed under the MIT license.
 */

'use strict';

var inquirer = require( 'inquirer' );

module.exports = function( grunt ) {

	var path = require( 'path' );
	var exec = require( 'child_process' ).exec, child;

	grunt.registerMultiTask( 'wp_plugin', 'Deploy WordPress plug-in to SVN repository.', function() {
		var done = this.async();

		var options = this.options({
			assets_dir: false,
			deploy_dir: false,
			plugin_slug: false,
			svn_username: false,
			svn_repository: 'http://plugins.svn.wordpress.org/{plugin-slug}'
		});

		if ( ! options.deploy_dir ) {
			grunt.fail.fatal( 'Plug-in deploy directory not found.' );
		} else if ( ! options.plugin_slug ) {
			grunt.fail.fatal( 'Every plug-in must have a slug, fool.' );
		}

		inquirer.prompt([{
			type: 'input',
			name: 'svn_username',
			message: 'What\'s your SVN Username?',
			when: function() {
				if ( ! options.svn_username ) {
					return true;
				}
			},
			validate: function( answer ) {
				if ( answer.length < 1 ) {
					return 'Username can\'t be empty, stupid.';
				}
				return true;
			}
		}], function( answers ) {
			var deployDir = path.resolve( options.deploy_dir );
			var svnTmpDir = path.resolve( path.join( 'tmp', options.plugin_slug ) );

			/**
			 * Subversion Arguments.
			 * @param  {array} args
			 * @return {array} args
			 */
			var svnArgs = function( args ) {
				var svn_username = options.svn_username || answers.svn_username;
				if ( svn_username ) {
					args.push( '--username' );
					args.push( svn_username );
				}

				return args;
			};

			/**
			 * Subversion Checkout.
			 * @return {null}
			 */
			var svnCheckout = function() {
				var svn_repository = options.svn_repository.replace( '{plugin-slug}', options.plugin_slug );

				grunt.log.writeln( 'Subversion checkout: ' + svn_repository.cyan );

				grunt.util.spawn( { cmd: 'svn', args: svnArgs( [ 'co', svn_repository, svnTmpDir ] ), opts: { stdio: 'inherit' } }, function( error, result, code ) {
					grunt.log.ok( 'Subversion checkout done.' );

					svnUpdate();
				});
			};

			/**
			 * Subversion Update.
			 * @return {null}
			 */
			var svnUpdate = function() {
				var svnTagsDir  = svnTmpDir + '/tags/' + getVersion();
				var svnTrunkDir = svnTmpDir + '/trunk';

				// Subversion update
				grunt.log.writeln( 'Subversion update...' );

				grunt.util.spawn( { cmd: 'svn', args: svnArgs( ['up'] ), opts: { stdio: 'inherit', cwd: svnTmpDir } }, function( error, result, code ) {
					grunt.log.ok( 'Subversion update done.' );

					// Delete trunk
					grunt.file.delete( svnTrunkDir );
					grunt.log.ok( 'Subversion trunk deleted.' );

					// Copy deploy to trunk
					grunt.log.writeln( 'Copying deploy to trunk...' );

					grunt.util.spawn( { cmd: 'cp', args: [ '-R', deployDir, svnTrunkDir ], opts: { stdio: 'inherit' } }, function( error, result, code ) {
						grunt.log.ok( 'Copied: ' + deployDir.cyan + ' -> ' + svnTrunkDir.cyan );

						// Subversion add
						grunt.log.writeln( 'Subversion add...' );

						grunt.util.spawn( { cmd: 'svn', args: [ 'add', '.', '--force', '--auto-props', '--parents', '--depth', 'infinity' ], opts: { stdio: 'inherit', cwd: svnTmpDir } }, function( error, result, code ) {
							grunt.log.ok( 'Subversion add done.' );

							// Subversion remove
							grunt.log.writeln( 'Subversion remove...' );

							child = exec( "svn rm $( svn status | sed -e '/^!/!d' -e 's/^!//' )", { cwd: svnTmpDir }, function() {
								grunt.log.ok( 'Subversion remove done.' );

								// Subversion tag
								grunt.log.writeln( 'Check if Subversion tag dir exists...' );

								if ( grunt.file.isDir( svnTagsDir ) ) {
									grunt.fail.fatal( 'Subversion tag already exists.' );
								} else {
									grunt.log.writeln( 'Subversion tag...' );

									grunt.util.spawn( { cmd: 'svn', args: [ 'copy', svnTrunkDir, svnTagsDir ], opts: { stdio: 'inherit', cwd: svnTmpDir } },  function( error, result, code ) {
										grunt.log.ok( 'Subversion tag done.' );

										svnCommit();
									});
								}
							});
						});
					});
				});
			};

			/**
			 * Subversion Commit.
			 * @return {null}
			 */
			var svnCommit = function() {
				var commitMessage = 'Release ' + getVersion() + ', see readme.txt for changelog.';

				grunt.log.writeln( 'Subversion commit...' );

				grunt.util.spawn( { cmd: 'svn', args: svnArgs( [ 'ci', '-m', commitMessage ] ), opts: { stdio: 'inherit', cwd: svnTmpDir } },  function( error, result, code ) {
					grunt.log.ok( commitMessage );

					done();
				});
			};

			/**
			 * Subversion Assets.
			 * @param  {string} commitMessage No prompt, apply commit message.
			 * @return {null}
			 */
			var svnAssets = function( commitMessage ) {
				var svnAssetsDir = svnTmpDir + '/assets';

				inquirer.prompt([
					{
						type: 'confirm',
						name: 'update_assets',
						message: 'Are you sure you want to update plug-in assets?',
						default: true,
						when: function() {
							if ( ! commitMessage ) {
								return true;
							}
						}
					},
					{
						type: 'list',
						name: 'commit',
						message: 'What commit message do you need?',
						choices: [ 'Custom', 'Default' ],
						when: function( answers ) {
							return answers.update_assets;
						},
						filter: function( val ) {
							return val.toLowerCase();
						}
					},
					{
						type: 'rawlist',
						name: 'commit_list',
						message: 'What about these commit message?',
						choices: [
							'All Plug-in assets updated.',
							new inquirer.Separator(),
							'Updated Plug-in icon images.',
							'Updated Plug-in banner images.',
							'Updated Plug-in screenshots images.'
						],
						when: function( answers ) {
							return answers.commit === 'default';
						}
					},
					{
						type: 'input',
						name: 'commit_message',
						message: 'Any commit message on your need',
						default: 'All Plug-in assets updated successfully.',
						when: function( answers ) {
							return answers.commit === 'custom';
						}
					}
				], function( answers ) {
					var message = '';

					if ( commitMessage ) {
						message = commitMessage;
					} else if ( answers.update_assets ) {
						message = ( answers.commit !== 'custom' ) ? answers.commit_list : answers.commit_message;
					} else {
						grunt.log.warn( 'Aborting Plug-in assets update...' );
						return;
					}

					grunt.log.ok( message );
				});
			};

			/**
			 * Get Plug-in Release Version.
			 * @return {string} version
			 */
			var getVersion = function() {
				var readme_file = path.join( deployDir, 'readme.txt' );
				var plugin_file = path.join( deployDir, options.plugin_slug + '.php' );

				// Check if Readme and Plug-in file exists
				if ( ! grunt.file.exists( readme_file ) ) {
					grunt.fail.warn( 'Readme file "' + readme_file + '" not found.' );
				} else if ( ! grunt.file.exists( plugin_file ) ) {
					grunt.fail.warn( 'Plug-in file "' + plugin_file + '" not found.' );
				}

				// Get Versions
				var readme_version = grunt.file.read( readme_file ).match( new RegExp( '^Stable tag:\\s*(\\S+)', 'im' ) );
				var plugin_version = grunt.file.read( plugin_file ).match( new RegExp( '^[ \t\/*#@]*Version:\\s*(\\S+)$', 'im' ) );

				// Compare Versions
				if ( versionCompare( readme_version[1], plugin_version[1] ) ) {
					grunt.log.warn( 'Readme version: ' + ( 'v' + readme_version[1] ).cyan );
					grunt.log.warn( 'Plugin version: ' + ( 'v' + plugin_version[1] ).cyan );
					grunt.fail.warn( 'Main Readme and Plugin file versions do not match.' );
				}

				return plugin_version[1];
			};

			/**
			 * Simply compares Readme and Plug-in file version.
			 *
			 * Returns:
			 * -1 = readme is LOWER than plugin
			 *  0 = they are equal
			 *  1 = readme is GREATER = plugin is LOWER
			 *  And FALSE if one of input versions are not valid
			 *
			 * @param  {string} readme Readme Stable Tag
			 * @param  {string} plugin Main Plug-in Version
			 * @return {integer|boolean}
			 */
			var versionCompare = function( readme, plugin ) {
				if ( typeof readme + typeof plugin !== 'stringstring' ) {
					return false;
				}

				var a = readme.split( '.' );
				var b = plugin.split( '.' );

				for ( var i = 0; i < Math.max( a.length, b.length ); i++ ) {
					if ( ( a[i] && ! b[i] && parseInt( a[i], 10 ) > 0 ) || ( parseInt( a[i], 10 ) > parseInt( b[i], 10 ) ) ) {
						return 1;
					} else if ( ( b[i] && ! a[i] && parseInt( b[i], 10 ) > 0 ) || ( parseInt( a[i], 10 ) < parseInt( b[i], 10 ) ) ) {
						return -1;
					}
				}

				return 0;
			};

			/**
			 * Subversion Update or Checkout Logic.
			 * @return {null}
			 */
			grunt.log.writeln( 'Check if Subversion dir exists...' );

			if ( grunt.file.isDir( svnTmpDir ) ) {
				grunt.log.ok( 'Subversion dir exists.' );

				svnUpdate();
			} else {
				grunt.log.ok( 'Subversion dir doesn\'t exists.' );

				svnCheckout();
			}
		});
	});
};