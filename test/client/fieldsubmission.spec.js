/* global describe, it, beforeEach*/
'use strict';

var chai = require( 'chai' );
var expect = chai.expect;
var chaiAsPromised = require( 'chai-as-promised' );
var FieldSubmissionQueue = require( '../../public/js/src/module/field-submission-queue.js' );

chai.use( chaiAsPromised );

describe( 'Field Submission', function() {
    var p1 = '/a/b/c';
    var p2 = '/a/r[3]/d';
    var id = 'abc';
    var did = 'def';

    describe( 'queue', function() {

        it( 'adds regular items', function() {
            var q = new FieldSubmissionQueue();
            q.addFieldSubmission( p1, '1', id );
            q.addFieldSubmission( p2, 'a', id );
            expect( Object.keys( q.get() ).length ).to.equal( 2 );
            expect( q.get()[ 'POST_' + p1 ] ).to.be.an.instanceOf( FormData );
            expect( q.get()[ 'POST_' + p2 ] ).to.be.an.instanceOf( FormData );
            expect( q.get()[ 'POST_' + p1 ].getAll( 'xml_submission_fragment_file' ) ).to.deep.equal( [ '1' ] );
            expect( q.get()[ 'POST_' + p2 ].getAll( 'xml_submission_fragment_file' ) ).to.deep.equal( [ 'a' ] );
        } );

        it( 'overwrites older values in the queue for the same node', function() {
            var q = new FieldSubmissionQueue();
            q.addFieldSubmission( p1, '1', id );
            q.addFieldSubmission( p1, '2', id );
            expect( Object.keys( q.get() ).length ).to.equal( 1 );
            expect( q.get()[ 'POST_' + p1 ] ).to.be.an.instanceOf( FormData );
            expect( q.get()[ 'POST_' + p1 ].getAll( 'xml_submission_fragment_file' ) ).to.deep.equal( [ '2' ] );
        } );

        it( 'adds edits of already submitted items', function() {
            var q = new FieldSubmissionQueue();
            q.addFieldSubmission( p1, '1', id, did );
            q.addFieldSubmission( p2, 'a', id, did );
            expect( Object.keys( q.get() ).length ).to.equal( 2 );
            expect( q.get()[ 'PUT_' + p1 ] ).to.be.an.instanceOf( FormData );
            expect( q.get()[ 'PUT_' + p2 ] ).to.be.an.instanceOf( FormData );
            expect( q.get()[ 'PUT_' + p1 ].getAll( 'xml_submission_fragment_file' ) ).to.deep.equal( [ '1' ] );
            expect( q.get()[ 'PUT_' + p2 ].getAll( 'xml_submission_fragment_file' ) ).to.deep.equal( [ 'a' ] );
        } );

        it( 'overwrites older values of edited already-submitted items', function() {
            var q = new FieldSubmissionQueue();
            q.addFieldSubmission( p1, '1', id, did );
            q.addFieldSubmission( p1, '2', id, did );
            expect( Object.keys( q.get() ).length ).to.equal( 1 );
            expect( q.get()[ 'PUT_' + p1 ] ).to.be.an.instanceOf( FormData );
            expect( q.get()[ 'PUT_' + p1 ].getAll( 'xml_submission_fragment_file' ) ).to.deep.equal( [ '2' ] );
        } );

        it( 'adds items that delete a repeat', function() {
            var q = new FieldSubmissionQueue();
            q.addRepeatRemoval( '1', id );
            q.addRepeatRemoval( 'a', id, did );
            expect( Object.keys( q.get() ).length ).to.equal( 2 );
            expect( q.get()[ 'DELETE_0' ] ).to.be.an.instanceOf( FormData );
            expect( q.get()[ 'DELETE_1' ] ).to.be.an.instanceOf( FormData );
            expect( q.get()[ 'DELETE_0' ].getAll( 'xml_submission_fragment_file' ) ).to.deep.equal( [ '1' ] );
            expect( q.get()[ 'DELETE_1' ].getAll( 'xml_submission_fragment_file' ) ).to.deep.equal( [ 'a' ] );
        } );

    } );

    describe( 'queue manages submission failures and successes', function() {
        var q;
        var i;
        var failSubmitOne = function() {
            return Promise.reject( new Error( 'Error: 400' ) );
        };
        var succeedSubmitOne = function() {
            return Promise.resolve( 201 );
        };
        var succeedFailSubmitOne = function() {
            i++;
            return ( i % 2 === 0 ) ? failSubmitOne() : succeedSubmitOne();
        };

        beforeEach( function() {
            i = 0;
            q = new FieldSubmissionQueue();
            q.addFieldSubmission( p1, '1', id );
            q.addFieldSubmission( p2, 'a', id );
        } );

        it( 'removes a queue item if submission was successful', function() {
            q._submitOne = succeedSubmitOne;

            var updatedQueueKeys = q.submitAll()
                .then( function( results ) {
                    return Object.keys( q.get() );
                } );
            return expect( updatedQueueKeys ).to.eventually.deep.equal( [] );
        } );

        it( 'retains a queue item if submission failed', function() {
            q._submitOne = failSubmitOne;

            var updatedQueueKeys = q.submitAll()
                .then( function( results ) {
                    return Object.keys( q.get() );
                } );
            return expect( updatedQueueKeys ).to.eventually.deep.equal( [ 'POST_' + p1, 'POST_' + p2 ] );
        } );

        it( 'retains a queue item if submission failed', function() {
            q._submitOne = succeedFailSubmitOne;

            var updatedQueueKeys = q.submitAll()
                .then( function( results ) {
                    return Object.keys( q.get() );
                } );
            return expect( updatedQueueKeys ).to.eventually.deep.equal( [ 'POST_' + p2 ] );
        } );

        it( 'if a field is updated during a failing submission attempt, ' +
            'the old field submission will not be retained in the queue',
            function() {
                q._submitOne = succeedFailSubmitOne;

                var updatedQueue = q.submitAll()
                    .then( function( results ) {
                        return q.get();
                    } );
                // this will complete before updatedQueueKeys is resolved!
                q.addFieldSubmission( p2, 'b', id );

                return Promise.all( [
                    expect( updatedQueue ).to.eventually.have.property( 'POST_' + p2 ).and.satisfy( function( fd ) {
                        return fd.getAll( 'xml_submission_fragment_file' ).toString() === [ 'b' ].toString();
                    } ),
                    expect( updatedQueue ).to.eventually.not.have.property( 'POST_' + p1 )
                ] );
            } );
    } );

    // TODO
    // * timeout


} );
