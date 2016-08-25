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
var FieldSubmissionQueue = require( './field-submission-queue' );
var fieldSubmissionQueue = new FieldSubmissionQueue();
var ongoingUpdates = [];
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
            $formprogress = $( '.form-progress' );
            form = new Form( formSelector, data );

            // set eventhandlers before initializing form
            _setEventHandlers( selector );

            loadErrors = form.init();

            window.form = form; // DEBUG

            if ( form.getEncryptionKey() ) {
                loadErrors.unshift( '<strong>' + t( 'error.encryptionnotsupported' ) + '</strong>' );
            }

            _setLogoutLinkVisibility();

            if ( loadErrors.length > 0 ) {
                throw loadErrors;
            }
            resolve();
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

function _close() {
    if ( Object.keys( fieldSubmissionQueue.get() ).length > 0 ) {
        console.log( 'There are unsubmitted items in the queue!' );
        gui.alert( 'Not all data has been submitted. If you continue this will be lost.', 'Warning', 'warning' );
        return 'Any unsaved data will be lost';
        // TODO: may need to return promise here.
    }
}

/**
 * Finishes a submission
 */
function _complete( updated ) {
    //var record;
    var redirect;
    var beforeMsg;
    var authLink;
    var level;
    var msg = [];

    form.getView().$.trigger( 'beforesave' );

    beforeMsg = ( redirect ) ? t( 'alert.submission.redirectmsg' ) : '';
    authLink = '<a href="/login" target="_blank">' + t( 'here' ) + '</a>';

    gui.alert( beforeMsg + '<br />' +
        '<div class="loader-animation-small" style="margin: 10px auto 0 auto;"/>', t( 'alert.submission.msg' ), 'bare' );


    // 1 store ongoing calls to submitAll as a variable?
    // 2. wait until promise completes
    // 3. check queue length
    // 4. if length = 0 -> send special 'finish' request
    // 5. if length > 0 -> ?

    //if ( Object.keys( fieldSubmissionQueue.get() ).length === 0 && !fieldSubmissionQueue.submissionOngoing ) {
    // all is good
    //}

    return Promise.all( ongoingUpdates )
        .then( function() {
            console.debug( 'all ongoing updates complete' );
            ongoingUpdates = [];
            return fieldSubmissionQueue.submitAll();
        } )
        .then( function() {
            var queueLength = Object.keys( fieldSubmissionQueue.get() ).length;
            console.debug( 'result: ', queueLength );

            if ( queueLength === 0 ) {
                return fieldSubmissionQueue.complete();
            } else {
                return false;
            }
        } )
        .then( function( result ) {
            if ( result === true ) {
                gui.alert( 'Whoohooeeeee', 'Yay', 'success' );
                // this event is used in communicating back to iframe parent window
                $( document ).trigger( 'submissionsuccess' );
            } else {
                console.error( 'not good', result );
                gui.alert( 'Something terrible happened.', 'Ugh', 'error' );
            }

            /*
            result = result || {};
            level = 'success';

            if ( result.failedFiles && result.failedFiles.length > 0 ) {
                msg = [ t( 'alert.submissionerror.fnfmsg', {
                    failedFiles: result.failedFiles.join( ', ' ),
                    supportEmail: settings.supportEmail
                } ) ];
                level = 'warning';
            }*/


            /*
            if ( settings.returnUrl ) {
                msg += '<br/>' + t( 'alert.submissionsuccess.redirectmsg' );
                gui.alert( msg, t( 'alert.submissionsuccess.heading' ), level );
                setTimeout( function() {
                    location.href = decodeURIComponent( settings.returnUrl );
                }, 1500 );
            } else {
                msg = ( msg.length > 0 ) ? msg : t( 'alert.submissionsuccess.msg' );
                gui.alert( msg, t( 'alert.submissionsuccess.heading' ), level );
                //_resetForm( true );
            }
            */
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

}

function _setEventHandlers( selector ) {
    var $doc = $( document );
    $doc
        .on( 'progressupdate.enketo', selector, function( event, status ) {
            if ( $formprogress.length > 0 ) {
                $formprogress.css( 'width', status + '%' );
            }
        } );

    $doc.on( 'dataupdate.enketo', selector, function( event, updated ) {
        var instanceId = form.getInstanceID();
        var deprecatedId = form.getDeprecatedID();
        var file;
        var update;

        console.debug( 'update.enketo', updated );

        if ( updated.cloned ) {
            return;
        }
        if ( !updated.xmlFragment ) {
            console.error( 'Could not submit field. XML fragment missing.' );
            return;
        }
        if ( !instanceId ) {
            console.error( 'Could not submit field. InstanceID missing' );
            return;
        }
        if ( updated.removed ) {
            fieldSubmissionQueue.addRepeatRemoval( updated.xmlFragment, instanceId, deprecatedId );
            fieldSubmissionQueue.submitAll();
        } else if ( updated.fullPath && typeof updated.validCheck !== 'undefined' && updated.requiredCheck !== 'undefined' ) {
            // TODO this is asynchronous! So when complete() triggers a beforesave event, this fieldsubmission occurs too late!

            update = updated.requiredCheck
                .then( function( passed ) {
                    if ( passed ) {
                        return updated.validCheck;
                    }
                } )
                .then( function( passed ) {
                    if ( passed ) {
                        if ( updated.file ) {
                            file = fileManager.getCurrentFile( updated.file );
                            console.debug( 'found file', file );
                        }
                        fieldSubmissionQueue.addFieldSubmission( updated.fullPath, updated.xmlFragment, instanceId, deprecatedId, file );
                        return fieldSubmissionQueue.submitAll();
                    } else {
                        console.debug( 'Value fails required and/or validation check. It will not submit' );
                    }
                } );

            ongoingUpdates.push( update );
        } else {
            console.error( 'Could not submit field. Full path or validation checks are missing.' );
        }
    } );

    $( 'button#close-form' ).click( function() {
        console.log( 'clicked close-form' );
        // TODO: change button state?
        return _close();
    } );

    $( 'button#finish-form' ).click( function() {
        var $button = $( this ).btnBusyState( true );

        form.validate()
            .then( function( valid ) {
                if ( valid ) {
                    return _complete();
                } else {
                    gui.alert( t( 'alert.validationerror.msg' ) );
                }
            } )
            .catch( function( e ) {
                gui.alert( e.message );
            } )
            .then( function() {
                $button.btnBusyState( false );
            } );

        return false;
    } );

    if ( _inIframe() && settings.parentWindowOrigin ) {
        //$doc.on( 'submissionsuccess edited.enketo', _postEventAsMessageToParentWindow );
    }

    window.onbeforeunload = _close;
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
