/**
 * Deals with the main high level survey controls for the special online-only auto-fieldsubmission view.
 *
 * Field values are automatically submitted upon change to a special OpenClinica Field Submission API.
 */

'use strict';

var gui = require( './gui' );
var settings = require( './settings' );
var Form = require( 'enketo-core' );
var fileManager = require( './file-manager' );
var t = require( './translator' ).t;
var $ = require( 'jquery' );
var utils = require( './utils' );
var FIELDSUBMISSION_URL = ( settings.enketoId ) ? settings.basePath + '/fieldsubmission/' + settings.enketoIdPrefix + settings.enketoId +
    utils.getQueryString( settings.submissionParameter ) : null;
var fieldSubmissionQueue = {};
var fieldSubmissionOngoing = false;
var fieldSubmissionInterval;
var form;
var formSelector;
var formData;
var $formprogress;

function init( selector, data ) {
    var advice;
    var loadErrors = [];

    formSelector = selector;
    formData = data;

    return new Promise( function( resolve, reject ) {
            form = new Form( formSelector, data );
            loadErrors = form.init();

            if ( form.getEncryptionKey() ) {
                loadErrors.unshift( '<strong>' + t( 'error.encryptionnotsupported' ) + '</strong>' );
            }

            $formprogress = $( '.form-progress' );

            _setEventHandlers();
            _setLogoutLinkVisibility();

            if ( loadErrors.length > 0 ) {
                throw loadErrors;
            }
        } )
        .catch( function( error ) {
            if ( Array.isArray( error ) ) {
                loadErrors = error;
            } else {
                loadErrors.unshift( error.message || t( 'error.unknown' ) );
            }

            advice = ( data.instanceStr ) ? t( 'alert.loaderror.editadvice' ) : t( 'alert.loaderror.entryadvice' );
            gui.alertLoadErrors( loadErrors, advice );
        } );
}

/**
 * Controller function to reset to a blank form. Checks whether all changes have been saved first
 * @param  {boolean=} confirmed Whether unsaved changes can be discarded and lost forever
 */
function _resetForm( confirmed ) {
    var message;
    var choices;

    if ( !confirmed && form.getEditStatus() ) {
        message = t( 'confirm.save.msg' );
        choices = {
            posAction: function() {
                _resetForm( true );
            }
        };
        gui.confirm( message, choices );
    } else {
        //_setDraftStatus( false );
        form.resetView();
        form = new Form( formSelector, {
            modelStr: formData.modelStr,
            external: formData.external
        } );
        form.init();
        form.getView().$
            .trigger( 'formreset' );
    }
}

/**
 * Finishes a submission
 */
function _finish( updated ) {
    //var record;
    //var redirect;
    //var beforeMsg;
    //var authLink;
    //var level;
    //var msg = [];

    form.getView().$.trigger( 'beforesave' );

    //beforeMsg = ( redirect ) ? t( 'alert.submission.redirectmsg' ) : '';
    //authLink = '<a href="/login" target="_blank">' + t( 'here' ) + '</a>';

    //gui.alert( beforeMsg + '<br />' +
    //    '<div class="loader-animation-small" style="margin: 10px auto 0 auto;"/>', t( 'alert.submission.msg' ), 'bare' );
    /*
        record = {
            'xml': form.getDataStr(),
            'files': fileManager.getCurrentFiles(),
            'instanceId': form.getInstanceID(),
            'deprecatedId': form.getDeprecatedID()
        };

        return connection.uploadRecord( record )
            .then( function( result ) {
                result = result || {};
                level = 'success';

                if ( result.failedFiles && result.failedFiles.length > 0 ) {
                    msg = [ t( 'alert.submissionerror.fnfmsg', {
                        failedFiles: result.failedFiles.join( ', ' ),
                        supportEmail: settings.supportEmail
                    } ) ];
                    level = 'warning';
                }

                // this event is used in communicating back to iframe parent window
                $( document ).trigger( 'submissionsuccess' );

                if ( settings.returnUrl ) {
                    msg += '<br/>' + t( 'alert.submissionsuccess.redirectmsg' );
                    gui.alert( msg, t( 'alert.submissionsuccess.heading' ), level );
                    setTimeout( function() {
                        location.href = decodeURIComponent( settings.returnUrl );
                    }, 1500 );
                } else {
                    msg = ( msg.length > 0 ) ? msg : t( 'alert.submissionsuccess.msg' );
                    gui.alert( msg, t( 'alert.submissionsuccess.heading' ), level );
                    _resetForm( true );
                }
            } )
            .catch( function( result ) {
                var message;
                result = result || {};
                console.error( 'submission failed', result );
                if ( result.status === 401 ) {
                    message = t( 'alert.submissionerror.authrequiredmsg', {
                        here: authLink
                    } );
                } else {
                    message = result.message || gui.getErrorResponseMsg( result.status );
                }
                gui.alert( message, t( 'alert.submissionerror.heading' ) );
            } );
        */
}

function _addToFieldSubmissionQueue( fieldPath, value, instanceId, deprecatedId ) {
    var fd = new FormData();

    if ( fieldPath && instanceId ) {
        if ( value instanceof Blob ) {
            fd.append( fieldPath, value, value.name );
        } else {
            fd.append( fieldPath, value );
        }
        fd.append( 'instanceID', instanceId );
        if ( deprecatedId ) {
            fd.append( 'deprecatedID', deprecatedId );
        }
        // Overwrite if older value fieldsubmission in queue.
        fieldSubmissionQueue[ fieldPath ] = fd;
        console.debug( 'new fieldSubmissionQueue', fieldSubmissionQueue );
    } else {
        console.error( 'Attempt to add field submission without path or instanceID' );
    }
}

function _submitFieldSubmissionQueue() {
    var submission;
    var queue;

    if ( Object.keys( fieldSubmissionQueue ).length > 0 && !fieldSubmissionOngoing ) {
        // convert fieldSubmission object to array of objects
        queue = Object.keys( fieldSubmissionQueue ).map( function( key ) {
            return {
                name: key,
                fd: fieldSubmissionQueue[ key ]
            };
        } );
        console.debug( 'queue to submit', queue );
        // empty the fieldSubmission queue
        fieldSubmissionQueue = {};
        return queue.reduce( function( prevPromise, fieldSubmission ) {
                return prevPromise.then( function() {
                    return _submitFieldSubmission( fieldSubmission.fd )
                        .catch( function( error ) {
                            console.debug( 'failed to submit ', fieldSubmission.name, 'adding it back to the queue, ERROR:', error );
                            // add back to the fieldSubmission queue if the field value wasn't overwritten in the mean time
                            if ( typeof fieldSubmissionQueue[ fieldSubmission.name ] === 'undefined' ) {
                                fieldSubmissionQueue[ fieldSubmission.name ] = fieldSubmission.fd;
                            }
                        } );
                } );
            }, Promise.resolve() )
            .then( function( results ) {
                console.debug( 'all done with queue submission, results: ', results, ', current queue', fieldSubmissionQueue );
            } )
            .then( _restartSubmissionInterval )
            .catch( function( error ) {
                console.error( 'Unexpected error:', error );
            } );
    }
}

function _submitFieldSubmission( fd ) {
    return new Promise( function( resolve, reject ) {
        $.ajax( FIELDSUBMISSION_URL, {
                type: 'POST',
                data: fd,
                cache: false,
                contentType: false,
                processData: false,
                headers: {
                    'X-OpenClinica-Version': '1.0'
                },
                timeout: 3 * 60 * 1000
            } )
            .done( function( data, textStatus, jqXHR ) {
                resolve( jqXHR.status );
            } )
            .fail( function() {
                reject( 'Failed to connect with /fieldsubmission server.' );
            } );
    } );
}

function _restartSubmissionInterval() {
    console.debug( 'restarting submissionInterval' );
    fieldSubmissionInterval = setInterval( _submitFieldSubmissionQueue, 1 * 60 * 1000 );
}

function _setEventHandlers() {
    var $doc = $( document );
    $doc
        .on( 'progressupdate.enketo', 'form.or', function( event, status ) {
            if ( $formprogress.length > 0 ) {
                $formprogress.css( 'width', status + '%' );
            }
        } )
        .on( 'fieldchange.enketo', 'form.or', function( event, updated ) {
            console.debug( 'fieldchange! ', updated );
            var instanceId = form.getInstanceID();
            var deprecatedId = form.getDeprecatedID();
            if ( updated.fullPath && instanceId ) {
                updated.valid
                    .then( function( valid ) {
                        if ( valid ) {
                            if ( !deprecatedId ) {
                                _addToFieldSubmissionQueue( updated.fullPath, updated.value, instanceId );
                                _submitFieldSubmissionQueue();
                            } else {
                                // TODO handle PUT /fieldsubmissionupdates
                            }
                        } else {
                            console.debug( 'value is not valid, will not submit' );
                        }
                    } );
            } else {
                console.error( 'Could not submit field. Missing either fullpath or instanceId', updated, instanceId );
            }
        } );

    if ( _inIframe() && settings.parentWindowOrigin ) {
        //$doc.on( 'submissionsuccess edited.enketo', _postEventAsMessageToParentWindow );
    }
}

function _setLogoutLinkVisibility() {
    var visible = document.cookie.split( '; ' ).some( function( rawCookie ) {
        return rawCookie.indexOf( '__enketo_logout=' ) !== -1;
    } );
    $( '.form-footer .logout' ).toggleClass( 'hide', !visible );
}

/** 
 * Determines whether the page is loaded inside an iframe
 * @return {boolean} [description]
 */
function _inIframe() {
    try {
        return window.self !== window.top;
    } catch ( e ) {
        return true;
    }
}

/**
 * Attempts to send a message to the parent window, useful if the webform is loaded inside an iframe.
 * @param  {{type: string}} event
 */
function _postEventAsMessageToParentWindow( event ) {
    if ( event && event.type ) {
        try {
            window.parent.postMessage( JSON.stringify( {
                enketoEvent: event.type
            } ), settings.parentWindowOrigin );
        } catch ( error ) {
            console.error( error );
        }
    }
}

module.exports = {
    init: init
};
