'use strict';

var settings = require( './settings' );
var t = require( './translator' ).t;
var utils = require( './utils' );
var $ = require( 'jquery' );
var FIELDSUBMISSION_URL = ( settings.enketoId ) ? settings.basePath + '/fieldsubmission/' + settings.enketoIdPrefix + settings.enketoId +
    utils.getQueryString( settings.submissionParameter ) : null;

function FieldSubmissionQueue() {
    this.submissionQueue = {};
    this.submissionOngoing = false;
    this.repeatRemovalCounter = 0;
    //this.submissionInterval;
}

FieldSubmissionQueue.prototype.get = function() {
    return this.submissionQueue;
};

FieldSubmissionQueue.prototype.addFieldSubmission = function( fieldPath, xmlFragment, instanceId, deprecatedId, file ) {
    var fd = new FormData();

    if ( fieldPath && xmlFragment && instanceId ) {

        fd.append( 'instanceID', instanceId );
        fd.append( 'xml_submission_fragment_file', xmlFragment );

        if ( file && file instanceof Blob ) {
            fd.append( file.name, file, file.name );
        }

        if ( deprecatedId ) {
            fd.append( 'deprecatedID', deprecatedId );
            // Overwrite if older value fieldsubmission in queue.
            this.submissionQueue[ 'PUT_' + fieldPath ] = fd;
        } else {
            this.submissionQueue[ 'POST_' + fieldPath ] = fd;
        }

        console.debug( 'new fieldSubmissionQueue', this.submissionQueue );
    } else {
        console.error( 'Attempt to add field submission without path, XML fragment or instanceID' );
    }
};

FieldSubmissionQueue.prototype.addRepeatRemoval = function( xmlFragment, instanceId, deprecatedId ) {
    var fd = new FormData();
    if ( xmlFragment && instanceId ) {

        // TODO: fragment as Blob
        fd.append( 'xml_submission_fragment_file', xmlFragment );

        fd.append( 'instanceID', instanceId );
        if ( deprecatedId ) {
            fd.append( 'deprecatedID', deprecatedId );
        }
        // Overwrite if older value fieldsubmission in queue.
        this.submissionQueue[ 'DELETE_' + this.repeatRemovalCounter++ ] = fd;
        console.debug( 'new fieldSubmissionQueue', this.submissionQueue );
    } else {
        console.error( 'Attempt to add repeat removal without XML fragment or instanceID' );
    }
};

FieldSubmissionQueue.prototype.submitAll = function() {
    var submission;
    var _queue;
    var method;
    var that = this;

    if ( Object.keys( this.submissionQueue ).length > 0 && !this.submissionOngoing ) {
        this.submissionOngoing = true;

        // convert fieldSubmission object to array of objects
        _queue = Object.keys( that.submissionQueue ).map( function( key ) {
            return {
                key: key,
                fd: that.submissionQueue[ key ]
            };
        } );
        console.debug( 'queue to submit', _queue );
        // empty the fieldSubmission queue
        that.submissionQueue = {};
        return _queue.reduce( function( prevPromise, fieldSubmission ) {
                return prevPromise.then( function() {
                    method = fieldSubmission.key.split( '_' )[ 0 ];
                    return that._submitOne( fieldSubmission.fd, method )
                        .catch( function( error ) {
                            console.debug( 'failed to submit ', fieldSubmission.key, 'adding it back to the queue, ERROR:', error );
                            // add back to the fieldSubmission queue if the field value wasn't overwritten in the mean time
                            if ( typeof that.submissionQueue[ fieldSubmission.key ] === 'undefined' ) {
                                that.submissionQueue[ fieldSubmission.key ] = fieldSubmission.fd;
                            }
                            return error;
                        } );
                } );
            }, Promise.resolve() )
            .then( function( lastResult ) {
                console.debug( 'all done with queue submission current queue is', that.submissionQueue );
            } )
            .catch( function( error ) {
                console.error( 'Unexpected error:', error.message );
            } )
            .then( function() {
                that._resetSubmissionInterval();
                that.submissionOngoing = false;
                return true;
            } );
    }
};

FieldSubmissionQueue.prototype._submitOne = function( fd, method ) {
    return new Promise( function( resolve, reject ) {
        $.ajax( FIELDSUBMISSION_URL, {
                type: method,
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
                if ( jqXHR.status === 201 || jqXHR.status === 202 ) {
                    resolve( jqXHR.status );
                } else {
                    throw jqXHR;
                }
            } )
            .fail( function( jqXHR ) {
                reject( new Error( 'Failed to submit to /fieldsubmission server with status: ' + jqXHR.status ) );
            } );
    } );
};

FieldSubmissionQueue.prototype._resetSubmissionInterval = function() {
    var that = this;
    clearInterval( this.submissionInterval );
    this.submissionInterval = setInterval( function() {
        that.submitAll();
    }, 1 * 60 * 1000 );
};

module.exports = FieldSubmissionQueue;
