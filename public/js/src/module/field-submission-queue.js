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
    //this.submissionInterval;
}

FieldSubmissionQueue.prototype.get = function() {
    return this.submissionQueue;
};

FieldSubmissionQueue.prototype.add = function( fieldPath, value, instanceId, deprecatedId ) {
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
        this.submissionQueue[ fieldPath ] = fd;
        console.debug( 'new fieldSubmissionQueue', this.submissionQueue );
    } else {
        console.error( 'Attempt to add field submission without path or instanceID' );
    }
};

FieldSubmissionQueue.prototype.submitAll = function() {
    var submission;
    var _queue;
    var that = this;

    if ( Object.keys( that.submissionQueue ).length > 0 && !that.submissionOngoing ) {
        that.submissionOngoing = true;
        // convert fieldSubmission object to array of objects
        _queue = Object.keys( that.submissionQueue ).map( function( key ) {
            return {
                name: key,
                fd: that.submissionQueue[ key ]
            };
        } );
        console.debug( 'queue to submit', _queue );
        // empty the fieldSubmission queue
        that.submissionQueue = {};
        return _queue.reduce( function( prevPromise, fieldSubmission ) {
                return prevPromise.then( function() {
                    return that._submitOne( fieldSubmission.fd )
                        .catch( function( error ) {
                            console.debug( 'failed to submit ', fieldSubmission.name, 'adding it back to the queue, ERROR:', error );
                            // add back to the fieldSubmission queue if the field value wasn't overwritten in the mean time
                            if ( typeof that.submissionQueue[ fieldSubmission.name ] === 'undefined' ) {
                                that.submissionQueue[ fieldSubmission.name ] = fieldSubmission.fd;
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

FieldSubmissionQueue.prototype._submitOne = function( fd ) {
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
    this.submissionInterval = setInterval( that.submitAll, 1 * 60 * 1000 );
};

module.exports = FieldSubmissionQueue;
