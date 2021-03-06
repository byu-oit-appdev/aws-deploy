.. _cloudwatchevents:

CloudWatch Events
=================
This document contains information about the CloudWatch Events service supported in Handel. This Handel service provisions a CloudWatch Events rule, which can then be integrated with services like Lambda to invoke them when events fire.

.. IMPORTANT::

    This service only offers limited tagging support. Cloudwatch events will not be tagged, but the Cloudformation stack used to create them will be. See :ref:`tagging-unsupported-resources`.


Parameters
----------

.. list-table::
   :header-rows: 1

   * - Parameter
     - Type
     - Required
     - Default
     - Description
   * - type
     - string
     - Yes
     - 
     - This must always be *cloudwatchevent* for this service type.
   * - description
     - string
     - No
     - Handel-created rule.
     - The event description.
   * - schedule
     - string
     - No
     - 
     - The cron or rate string specifying the schedule on which to fire the event. See the `Scheduled Events <http://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html>`_ document for information on the syntax of these schedule expressions.
   * - event_pattern
     - object
     - No
     - 
     - The list of event patterns on which to fire the event. In this field you just specify an `Event Pattern <http://docs.aws.amazon.com/AmazonCloudWatch/latest/events/CloudWatchEventsandEventPatterns.html>`_ in YAML syntax.
   * - state
     - string
     - No
     - enabled
     - What state the rule should be in. Allowed values: 'enabled', 'disabled'
   * - tags
     - :ref:`tagging-resources`
     - No
     -
     - Tags to be applied to the Cloudformation stack which provisions this resource.

Example Handel Files
--------------------

.. _cloudwatch-scheduled-lambda-example:

Scheduled Lambda
~~~~~~~~~~~~~~~~
This Handel file shows a CloudWatch Events service being configured, producing to a Lambda on a schedule:

.. code-block:: yaml

    version: 1

    name: my-scheduled-lambda

    environments:
      dev:
        function:
          type: lambda
          path_to_code: .
          handler: app.handler
          runtime: nodejs12.x
        schedule:
          type: cloudwatchevent
          schedule: rate(1 minute)
          event_consumers:
          - service_name: function
            event_input: '{"some": "param"}'

EBS Events Lambda
~~~~~~~~~~~~~~~~~
This Handel file shows a CloudWatch Events service being configured, producing to a Lambda when an EBS volume is created:

.. code-block:: yaml

    version: 1

    name: my-event-lambda

    environments:
      dev:
        function:
          type: lambda
          path_to_code: .
          handler: app.handler
          runtime: nodejs12.x
        schedule:
          type: cloudwatchevent
          event_pattern:
            source: 
            - aws.ec2
            detail-type: 
            - EBS Volume Notification
            detail:
            event:
            - createVolume
          event_consumers:
          - service_name: function

Depending on this service
-------------------------
The CloudWatch Events service cannot be referenced as a dependency for another Handel service. This service is intended to be used as a producer of events for other services.

Events produced by this service
-------------------------------
The CloudWatch Events service currently produces events for the following services types:

* Lambda

Events consumed by this service
-------------------------------
The CloudWatch Events service does not consume events from other Handel services.
